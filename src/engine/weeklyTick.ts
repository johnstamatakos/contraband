import { CONFIG } from './config'
import type { GameState, Route, ShipmentInTransit, WeeklySummary } from './gameState'
import { getFixedCosts, getMaintenanceCost } from './gameState'
import { generateContracts } from './contracts'
import { maybeGenerateWeather } from './weather'
import { moveThreat } from './threatMovement'
import { makeEvent, routeLabel, appendEvents, checkWinLose } from './engineHelpers'
import type { StepResult } from './engineHelpers'
import { getSkillEffect } from '../utils/gameHelpers'
import { WEEK_MS } from '../utils/time'

// ── Step 1: Forecast ──────────────────────────────────────────────────────────

function stepForecast(state: GameState, gameTimeMs: number): StepResult {
  const events = state.weatherEvents
    .filter(e => e.isForecast)
    .map(e => {
      const names = e.affectedRouteIds
        .map(id => state.routes.find(r => r.id === id))
        .filter(Boolean)
        .map(r => routeLabel(r!.origin, r!.destination))
        .join(', ')
      return makeEvent(gameTimeMs, `${e.type} incoming — ${names}`, 'warning')
    })

  const newEvent = maybeGenerateWeather(state)
  if (newEvent) {
    const names = newEvent.affectedRouteIds
      .map(id => state.routes.find(r => r.id === id))
      .filter(Boolean)
      .map(r => routeLabel(r!.origin, r!.destination))
      .join(', ')
    events.push(makeEvent(gameTimeMs, `${newEvent.type} forecast — ${names}`, 'warning'))
  }

  return {
    state: { ...state, weatherEvents: newEvent ? [...state.weatherEvents, newEvent] : state.weatherEvents },
    events,
  }
}

// ── Step 2: Pay fixed costs ───────────────────────────────────────────────────

function stepPayFixedCosts(state: GameState, gameTimeMs: number): StepResult {
  const total       = getFixedCosts(state)
  const maintenance = getMaintenanceCost(state)

  if (total === 0) return { state, events: [] }

  const events = []
  if (maintenance > 0) events.push(makeEvent(gameTimeMs, `Fleet maintenance: -$${maintenance.toLocaleString()}`, 'info'))

  return { state: { ...state, cash: state.cash - total }, events }
}

// ── Step 3: Update shipment freeze state ──────────────────────────────────────

function stepAdvanceShipments(state: GameState, gameTimeMs: number): StepResult {
  const frozenRouteIds = new Set(
    state.weatherEvents.filter(e => !e.isForecast).flatMap(e => e.affectedRouteIds),
  )
  const events: ReturnType<typeof makeEvent>[] = []

  const updatedShipments = state.shipmentsInTransit.map(s => {
    if (frozenRouteIds.has(s.routeId)) {
      const route = state.routes.find(r => r.id === s.routeId)
      events.push(makeEvent(gameTimeMs, `Weather delay: ${route ? routeLabel(route.origin, route.destination) : s.routeId}`, 'warning'))
      return { ...s, isFrozen: true }
    }
    return { ...s, isFrozen: false, turnsRemaining: Math.max(0, s.turnsRemaining - 1) }
  })

  return { state: { ...state, shipmentsInTransit: updatedShipments }, events }
}

// ── Step 4: Refresh contract board ────────────────────────────────────────────

function stepRefreshContracts(state: GameState, gameTimeMs: number): StepResult {
  // Drop unassigned contracts whose deadline has run out
  const active  = state.contracts.filter(c => c.isAssigned || c.deadline > 0)
  const dropped = state.contracts.length - active.length
  const fresh   = generateContracts({ ...state, contracts: active })

  const events = []
  if (dropped > 0) events.push(makeEvent(gameTimeMs, `${dropped} contract${dropped > 1 ? 's' : ''} expired.`, 'info'))
  if (fresh.length > 0) events.push(makeEvent(gameTimeMs, `${fresh.length} new contract${fresh.length > 1 ? 's' : ''} available.`, 'success'))

  return { state: { ...state, contracts: [...active, ...fresh], recentIllicitCompletions: [] }, events }
}

// ── Step 5a/b: Move inspector and interpol ────────────────────────────────────
// (Delegated to threatMovement.ts — both use the unified moveThreat function.)

function stepMoveInspector(state: GameState, gameTimeMs: number): StepResult {
  return moveThreat(state, 'inspector', gameTimeMs)
}

function stepMoveInterpol(state: GameState, gameTimeMs: number): StepResult {
  return moveThreat(state, 'interpol', gameTimeMs)
}

// ── Step 6: Decay route heat ──────────────────────────────────────────────────

function stepDecayRouteHeat(state: GameState): StepResult {
  const activeIllicitRouteIds = new Set(
    state.shipmentsInTransit.filter(s => s.isIllicit).map(s => s.routeId),
  )

  const updatedRoutes: Route[] = state.routes.map(r => {
    if (r.heat <= 0 || activeIllicitRouteIds.has(r.id)) return r
    return { ...r, heat: Math.max(0, r.heat - 1) }
  })

  return { state: { ...state, routes: updatedRoutes }, events: [] }
}

// ── Step 7: Decay global heat ─────────────────────────────────────────────────

function stepDecayGlobalHeat(state: GameState): StepResult {
  const extra   = getSkillEffect(state.unlockedSkills, 'network_3', 'globalHeatExtraDecay')
  const newHeat = Math.max(0, state.globalHeat - CONFIG.economy.globalHeatDecayPerWeek - extra)
  return { state: { ...state, globalHeat: newHeat }, events: [] }
}

// ── Step 8a: Rep decay for inactivity ─────────────────────────────────────────

function stepDecayReputation(state: GameState, gameTimeMs: number): StepResult {
  // Gate: no decay until the player has completed at least one illicit contract
  if (!state.hasCompletedFirstIllicit) return { state, events: [] }
  const { repDecayThresholdWeeks, repDecayPerWeek } = CONFIG.economy
  if (state.turnsWithoutIllicitActivity < repDecayThresholdWeeks) return { state, events: [] }
  const newRep = Math.max(0, state.reputation - repDecayPerWeek)
  const event = makeEvent(gameTimeMs,
    `No illicit activity — reputation fading. -${repDecayPerWeek} rep.`,
    'warning')
  return { state: { ...state, reputation: newRep }, events: [event] }
}

// ── Step 8b: Expire impounded vehicles ────────────────────────────────────────

function stepExpireImpounds(state: GameState, gameTimeMs: number): StepResult {
  const events = []
  let fleet = state.fleet

  for (const v of state.fleet) {
    if (v.isImpounded && v.impoundExpiresOnTurn !== null && state.turn >= v.impoundExpiresOnTurn) {
      fleet = fleet.filter(f => f.id !== v.id)
      events.push(makeEvent(gameTimeMs, `${v.name} permanently seized — impound window expired.`, 'danger'))
    }
  }

  return { state: { ...state, fleet }, events }
}

// ── Step 9a: Rival sabotage ───────────────────────────────────────────────────

function stepRivalSabotage(state: GameState, gameTimeMs: number): StepResult {
  const r = CONFIG.rival
  if (state.turn < r.appearsOnTurn) return { state, events: [] }

  const eligible = state.fleet.filter(v => !v.isImpounded)
  if (eligible.length < 2) return { state, events: [] }  // never strand the player's only vehicle

  const chance = r.chancePerWeek
  if (Math.random() >= chance) return { state, events: [] }

  const target = eligible[Math.floor(Math.random() * eligible.length)]!
  const ransom  = Math.round(target.purchasePrice * r.ransomFraction)

  return {
    state: {
      ...state,
      fleet: state.fleet.map(v =>
        v.id === target.id
          ? { ...v, isImpounded: true, impoundFine: ransom, impoundExpiresOnTurn: state.turn + r.impoundWeeks }
          : v,
      ),
    },
    events: [makeEvent(gameTimeMs,
      `Rival operation: ${target.name} sabotaged. Pay $${ransom.toLocaleString()} within ${r.impoundWeeks} weeks to recover.`,
      'danger',
    )],
  }
}

// ── Step 9b: Repair orphaned recurring contracts ─────────────────────────────
// Safety net: if a recurring contract has an assigned vehicle but no active
// shipment (e.g. state race between arrival resolution and weekly tick),
// redispatch the vehicle so the contract doesn't get stuck.

function stepRepairRecurring(state: GameState, gameTimeMs: number): StepResult {
  const events: ReturnType<typeof makeEvent>[] = []
  let { shipmentsInTransit, fleet, contracts } = state
  let changed = false

  for (const c of contracts) {
    if (!c.isRecurring || !c.isAssigned || c.legs.length !== 1) continue
    const leg = c.legs[0]!
    // Orphaned: has vehicle, no shipment, not marked complete
    if (leg.shipmentIds.length > 0 || leg.completedAt !== null || leg.assignedVehicleIds.length === 0) continue

    const vehicleId = leg.assignedVehicleIds[0]!
    const vehicle = fleet.find(v => v.id === vehicleId)
    if (!vehicle || vehicle.isImpounded) continue

    const route = state.routes.find(r =>
      r.status === 'open' && r.origin === leg.origin && r.destination === leg.destination,
    )
    if (!route) continue
    const travelDays = route.travelDays[vehicle.type]
    if (!travelDays) continue

    const newId = `ship_repair_${gameTimeMs}_${c.id}`
    const newShipment: ShipmentInTransit = {
      id: newId,
      contractId: c.id,
      vehicleId,
      routeId: route.id,
      legIndex: 0,
      turnsRemaining: travelDays,
      totalTurns: travelDays,
      isIllicit: c.isIllicit,
      isFrozen: false,
      departureTimeMs: gameTimeMs,
      frozenDurationMs: 0,
    }

    shipmentsInTransit = [...shipmentsInTransit, newShipment]
    contracts = contracts.map(ct =>
      ct.id === c.id
        ? { ...ct, legs: [{ ...leg, shipmentIds: [newId] }] }
        : ct,
    )
    fleet = fleet.map(v =>
      v.id === vehicleId
        ? { ...v, isAssigned: true, currentShipmentId: newId }
        : v,
    )
    changed = true
  }

  if (!changed) return { state, events }
  return { state: { ...state, shipmentsInTransit, fleet, contracts }, events }
}

// ── Step 9c: Advance turn counters and expire flags ───────────────────────────

function stepEndTurn(state: GameState, gameTimeMs: number): StepResult {
  const events: ReturnType<typeof makeEvent>[] = []

  const updatedContracts = state.contracts.map(c => ({
    ...c,
    deadline: Math.max(0, c.deadline - 1),
  }))

  const STORM_ACTIVE_MS = (WEEK_MS / 7) * CONFIG.weather.activeDurationDays

  const updatedRoutes: Route[] = state.routes.map(r => {
    // Real-time-opened routes are handled by useGameClock, not the weekly tick
    if (r.status === 'pending' && r.openAtMs !== null) return r

    if (r.status === 'pending' && r.turnsUntilOpen !== null) {
      const turns = r.turnsUntilOpen - 1
      if (turns <= 0) {
        events.push(makeEvent(gameTimeMs, `Route open: ${routeLabel(r.origin, r.destination)}`, 'success'))
        return { ...r, status: 'open' as const, turnsUntilOpen: null }
      }
      return { ...r, turnsUntilOpen: turns }
    }

    if (r.flaggedTurnsRemaining > 0) {
      const remaining = r.flaggedTurnsRemaining - 1
      if (remaining === 0)
        events.push(makeEvent(gameTimeMs, `Investigation lifted: ${routeLabel(r.origin, r.destination)}`, 'info'))
      return { ...r, flaggedTurnsRemaining: remaining }
    }

    return r
  })

  const updatedWeather = state.weatherEvents
    .map(e => ({
      ...e,
      turnsRemaining: e.turnsRemaining - 1,
      isForecast: false,
      clearAtMs: e.isForecast ? gameTimeMs + STORM_ACTIVE_MS : e.clearAtMs,
    }))
    .filter(e => e.turnsRemaining > 0)

  return {
    state: {
      ...state,
      turn: state.turn + 1,
      turnsWithoutIllicitActivity: state.turnsWithoutIllicitActivity + 1,
      contracts: updatedContracts,
      routes: updatedRoutes,
      weatherEvents: updatedWeather,
    },
    events,
  }
}

// ── Weekly tick orchestrator ──────────────────────────────────────────────────

export function resolveWeeklyTick(
  state: GameState,
  weekNumber: number,
  gameTimeMs: number,
): { state: GameState; summary: WeeklySummary } {
  if (state.phase === 'game_over') return { state, summary: buildEmptySummary(weekNumber) }

  const cashStart       = state.cash
  const repStart        = state.reputation
  const heatStart       = state.globalHeat
  const openAtStart     = new Set(state.routes.filter(r => r.status === 'open').map(r => r.id))
  const maintenanceCost = getMaintenanceCost(state)

  const steps = [
    (s: GameState) => stepForecast(s, gameTimeMs),
    (s: GameState) => stepPayFixedCosts(s, gameTimeMs),
    (s: GameState) => stepAdvanceShipments(s, gameTimeMs),
    (s: GameState) => stepRefreshContracts(s, gameTimeMs),
    (s: GameState) => stepMoveInspector(s, gameTimeMs),
    (s: GameState) => stepMoveInterpol(s, gameTimeMs),
    (s: GameState) => stepDecayRouteHeat(s),
    (s: GameState) => stepDecayGlobalHeat(s),
    (s: GameState) => stepDecayReputation(s, gameTimeMs),
    (s: GameState) => stepExpireImpounds(s, gameTimeMs),
    (s: GameState) => stepRivalSabotage(s, gameTimeMs),
    (s: GameState) => stepRepairRecurring(s, gameTimeMs),
    (s: GameState) => stepEndTurn(s, gameTimeMs),
  ]

  let current = state
  const allEvents = []
  for (const step of steps) {
    const result = step(current)
    current = result.state
    allEvents.push(...result.events)
  }

  const ws = state.weeklyStats
  const fixedCosts = Math.max(0, cashStart - current.cash)

  const summary: WeeklySummary = {
    weekNumber,
    fixedCosts,
    maintenanceCost,
    deliveryIncome:      ws.deliveryIncome,
    netCashChange:       ws.deliveryIncome - fixedCosts,
    repChange:           current.reputation - repStart,
    heatChange:          current.globalHeat - heatStart,
    contractsCompleted:  ws.contractsCompleted,
    busts:               ws.busts,
    routesOpened:        current.routes
      .filter(r => r.status === 'open' && !openAtStart.has(r.id))
      .map(r => routeLabel(r.origin, r.destination)),
    completedDeliveries: ws.deliveries,
  }

  current = {
    ...current,
    // Rolling 52-week (1-year) profit history for the P&L chart
    profitHistory: [...(current.profitHistory ?? []), summary.netCashChange].slice(-52),
    weeklyStats: { deliveryIncome: 0, contractsCompleted: 0, busts: 0, repFromDeliveries: 0, heatFromDeliveries: 0, deliveries: [] },
    lastWeeklySummary: summary,
  }
  current = appendEvents(current, allEvents)
  current = checkWinLose(current, gameTimeMs)

  return { state: current, summary }
}

function buildEmptySummary(weekNumber: number): WeeklySummary {
  return { weekNumber, fixedCosts: 0, maintenanceCost: 0, deliveryIncome: 0, netCashChange: 0, repChange: 0, heatChange: 0, contractsCompleted: 0, busts: 0, routesOpened: [], completedDeliveries: [] }
}

// Re-export for callers that used to import checkWinLose from turnEngine
export { checkWinLose } from './engineHelpers'
export { INTERPOL_TIERS } from './engineHelpers'
