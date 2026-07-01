import { CONFIG } from './config'
import type { GameState, Route, WeeklySummary } from './gameState'
import { getFixedCosts, getMaintenanceCost, getContactsCost } from './gameState'
import { generateContracts } from './contracts'
import { maybeGenerateWeather } from './weather'
import { moveThreat } from './threatMovement'
import { makeEvent, routeLabel, appendEvents, checkWinLose, INTERPOL_TIERS } from './engineHelpers'
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
  const contacts    = getContactsCost(state)

  if (total === 0) return { state, events: [] }

  const events = []
  if (maintenance > 0) events.push(makeEvent(gameTimeMs, `Fleet maintenance: -$${maintenance.toLocaleString()}`, 'info'))
  if (contacts   > 0) events.push(makeEvent(gameTimeMs, `Contact fees: -$${contacts.toLocaleString()}`, 'info'))

  return { state: { ...state, cash: state.cash - total }, events }
}

// ── Step 3: Update shipment freeze state ──────────────────────────────────────

function stepAdvanceShipments(state: GameState, gameTimeMs: number): StepResult {
  const frozenRouteIds = new Set(
    state.weatherEvents.filter(e => !e.isForecast).flatMap(e => e.affectedRouteIds),
  )
  const events = []

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
  const active  = state.contracts.filter(c => c.isAssigned || c.deadline > 0)
  const dropped = state.contracts.length - active.length
  const fresh   = generateContracts({ ...state, contracts: active })

  const events = []
  if (fresh.length  > 0) events.push(makeEvent(gameTimeMs, `${fresh.length} new contract(s) available.`, 'success'))
  else if (dropped  > 0) events.push(makeEvent(gameTimeMs, `${dropped} expired contract(s) removed.`, 'info'))

  return { state: { ...state, contracts: [...active, ...fresh] }, events }
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
  const extraDecay = getSkillEffect(state.unlockedSkills, 'shadow_2', 'routeHeatExtraDecay')

  const updatedRoutes: Route[] = state.routes.map(r => {
    if (r.heat <= 0 || activeIllicitRouteIds.has(r.id)) return r
    return { ...r, heat: Math.max(0, r.heat - 1 - extraDecay) }
  })

  return { state: { ...state, routes: updatedRoutes }, events: [] }
}

// ── Step 7: Decay global heat ─────────────────────────────────────────────────

function stepDecayGlobalHeat(state: GameState): StepResult {
  const extra   = getSkillEffect(state.unlockedSkills, 'network_3', 'globalHeatExtraDecay')
  const newHeat = Math.max(0, state.globalHeat - CONFIG.economy.globalHeatDecayPerWeek - extra)
  return { state: { ...state, globalHeat: newHeat }, events: [] }
}

// ── Step 8: Expire impounded vehicles ─────────────────────────────────────────

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

// ── Step 9: Advance turn counters and expire flags ────────────────────────────

function stepEndTurn(state: GameState, gameTimeMs: number): StepResult {
  const events = []

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

  const cashStart    = state.cash
  const repStart     = state.reputation
  const heatStart    = state.globalHeat
  const openAtStart  = new Set(state.routes.filter(r => r.status === 'open').map(r => r.id))

  const steps = [
    (s: GameState) => stepForecast(s, gameTimeMs),
    (s: GameState) => stepPayFixedCosts(s, gameTimeMs),
    (s: GameState) => stepAdvanceShipments(s, gameTimeMs),
    (s: GameState) => stepRefreshContracts(s, gameTimeMs),
    (s: GameState) => stepMoveInspector(s, gameTimeMs),
    (s: GameState) => stepMoveInterpol(s, gameTimeMs),
    (s: GameState) => stepDecayRouteHeat(s),
    (s: GameState) => stepDecayGlobalHeat(s),
    (s: GameState) => stepExpireImpounds(s, gameTimeMs),
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
    weeklyStats: { deliveryIncome: 0, contractsCompleted: 0, busts: 0, repFromDeliveries: 0, heatFromDeliveries: 0, deliveries: [] },
    lastWeeklySummary: summary,
  }
  current = appendEvents(current, allEvents)
  current = checkWinLose(current)

  return { state: current, summary }
}

function buildEmptySummary(weekNumber: number): WeeklySummary {
  return { weekNumber, fixedCosts: 0, deliveryIncome: 0, netCashChange: 0, repChange: 0, heatChange: 0, contractsCompleted: 0, busts: 0, routesOpened: [], completedDeliveries: [] }
}

// Re-export for callers that used to import checkWinLose from turnEngine
export { checkWinLose } from './engineHelpers'
export { INTERPOL_TIERS } from './engineHelpers'
