import { getCityName } from '../data/cities'

import type {
  GameState,
  LiveEvent,
  ShipmentInTransit,
  Route,
  WeeklySummary,
  DeliveryRecord,
} from './gameState'
import { getFixedCosts, getMaintenanceCost, getContactsCost } from './gameState'
import { generateContracts } from './contracts'
import { detectionChance } from './detection'
import { maybeGenerateWeather } from './weather'
import { WEEK_MS } from './constants'

// ─── Internal step result type ────────────────────────────────────────────────

interface StepResult {
  state: GameState
  events: LiveEvent[]
}

// ─── Event factory ────────────────────────────────────────────────────────────

let _eventSeq = 0
function evt(
  gameTimeMs: number,
  message: string,
  type: LiveEvent['type'] = 'info',
): LiveEvent {
  return {
    id: `e_${++_eventSeq}`,
    gameTimeMs,
    message,
    type,
  }
}

function route$(origin: string, dest: string): string {
  return `${getCityName(origin)} → ${getCityName(dest)}`
}

function appendEvents(state: GameState, newEvents: LiveEvent[]): GameState {
  const combined = [...state.events, ...newEvents]
  return { ...state, events: combined.slice(-50) }
}

// ─── Step 1: Forecast ─────────────────────────────────────────────────────────

function stepForecast(state: GameState, gameTimeMs: number): StepResult {
  const events: LiveEvent[] = []

  const incoming = state.weatherEvents.filter(e => e.isForecast)
  for (const e of incoming) {
    const routeNames = e.affectedRouteIds
      .map(id => state.routes.find(r => r.id === id))
      .filter(Boolean)
      .map(r => route$(r!.origin, r!.destination))
      .join(', ')
    events.push(evt(gameTimeMs,
      `${e.type} incoming — ${routeNames}`,
      'warning'))
  }

  const newEvent = maybeGenerateWeather(state)
  const updatedWeather = newEvent
    ? [...state.weatherEvents, newEvent]
    : state.weatherEvents

  if (newEvent) {
    const routeNames = newEvent.affectedRouteIds
      .map(id => state.routes.find(r => r.id === id))
      .filter(Boolean)
      .map(r => route$(r!.origin, r!.destination))
      .join(', ')
    events.push(evt(gameTimeMs,
      `${newEvent.type} forecast — ${routeNames}`,
      'warning'))
  }

  return { state: { ...state, weatherEvents: updatedWeather }, events }
}

// ─── Step 2: Pay fixed costs ──────────────────────────────────────────────────

function stepPayFixedCosts(state: GameState, gameTimeMs: number): StepResult {
  const total = getFixedCosts(state)
  const maintenance = getMaintenanceCost(state)
  const contacts = getContactsCost(state)

  if (total === 0) return { state, events: [] }

  const events: LiveEvent[] = []
  if (maintenance > 0) {
    events.push(evt(gameTimeMs, `Fleet maintenance: -$${maintenance.toLocaleString()}`, 'info'))
  }
  if (contacts > 0) {
    events.push(evt(gameTimeMs, `Contact fees: -$${contacts.toLocaleString()}`, 'info'))
  }

  return { state: { ...state, cash: state.cash - total }, events }
}

// ─── Step 3: Advance shipments (update isFrozen + frozenDurationMs for display)

function stepAdvanceShipments(state: GameState, gameTimeMs: number): StepResult {
  const events: LiveEvent[] = []

  const frozenRouteIds = new Set(
    state.weatherEvents
      .filter(e => !e.isForecast)
      .flatMap(e => e.affectedRouteIds),
  )

  const updatedShipments: ShipmentInTransit[] = state.shipmentsInTransit.map(s => {
    if (frozenRouteIds.has(s.routeId)) {
      const route = state.routes.find(r => r.id === s.routeId)
      const label = route ? route$(route.origin, route.destination) : s.routeId
      events.push(evt(gameTimeMs, `Weather delay: ${label}`, 'warning'))
      return { ...s, isFrozen: true }
    }
    return { ...s, isFrozen: false, turnsRemaining: Math.max(0, s.turnsRemaining - 1) }
  })

  return { state: { ...state, shipmentsInTransit: updatedShipments }, events }
}

// ─── Step 4: Refresh contract board ──────────────────────────────────────────

function stepRefreshContracts(state: GameState, gameTimeMs: number): StepResult {
  const active = state.contracts.filter(c => c.isAssigned || c.deadline > 0)
  const dropped = state.contracts.length - active.length
  const newContracts = generateContracts({ ...state, contracts: active })

  const events: LiveEvent[] = []
  if (newContracts.length > 0) {
    events.push(evt(gameTimeMs, `${newContracts.length} new contract(s) available.`, 'success'))
  } else if (dropped > 0) {
    events.push(evt(gameTimeMs, `${dropped} expired contract(s) removed.`, 'info'))
  }

  return { state: { ...state, contracts: [...active, ...newContracts] }, events }
}

// ─── Step 5: Move investigator ────────────────────────────────────────────────

function stepMoveInvestigator(state: GameState, gameTimeMs: number): StepResult {
  const inv = state.investigator

  if (state.turn < inv.appearsOnTurn) {
    return { state, events: [] }
  }

  const openCities = [
    ...new Set(
      state.routes
        .filter(r => r.status === 'open')
        .flatMap(r => [r.origin, r.destination]),
    ),
  ]

  if (inv.currentCityId === null) {
    if (openCities.length === 0) return { state, events: [] }
    const city = openCities[Math.floor(Math.random() * openCities.length)]!
    return {
      state: { ...state, investigator: { ...inv, currentCityId: city } },
      events: [evt(gameTimeMs, `Investigator arrived in ${getCityName(city)}.`, 'danger')],
    }
  }

  const adjacent = [
    ...new Set(
      state.routes
        .filter(r => r.status === 'open' &&
          (r.origin === inv.currentCityId || r.destination === inv.currentCityId))
        .flatMap(r => [r.origin, r.destination])
        .filter(c => c !== inv.currentCityId),
    ),
  ]

  if (adjacent.length === 0) return { state, events: [] }

  const next = adjacent[Math.floor(Math.random() * adjacent.length)]!
  const probable = adjacent.find(c => c !== next) ?? null

  const illicitNearby = state.shipmentsInTransit.some(s => {
    if (!s.isIllicit) return false
    const r = state.routes.find(r => r.id === s.routeId)
    return r && (r.origin === next || r.destination === next)
  })

  const msgSuffix = illicitNearby ? ' — illicit routes nearby!' : ''
  const evtType = illicitNearby ? 'danger' : 'warning'

  return {
    state: { ...state, investigator: { ...inv, currentCityId: next, probableNextCityId: probable } },
    events: [evt(gameTimeMs, `Investigator moved to ${getCityName(next)}${msgSuffix}`, evtType)],
  }
}

// ─── Step 6: Decay route heat ─────────────────────────────────────────────────

function stepDecayRouteHeat(state: GameState, _gameTimeMs: number): StepResult {
  const activeIllicitRouteIds = new Set(
    state.shipmentsInTransit.filter(s => s.isIllicit).map(s => s.routeId),
  )

  const updatedRoutes: Route[] = state.routes.map(r => {
    if (r.heat <= 0) return r
    if (activeIllicitRouteIds.has(r.id)) return r
    return { ...r, heat: Math.max(0, r.heat - 1) }
  })

  return { state: { ...state, routes: updatedRoutes }, events: [] }
}

// ─── Step 7: Decay global heat ────────────────────────────────────────────────

function stepDecayGlobalHeat(state: GameState, _gameTimeMs: number): StepResult {
  const newHeat = Math.max(0, state.globalHeat - 2)
  return { state: { ...state, globalHeat: newHeat }, events: [] }
}

// ─── Step 8: Reputation decay ─────────────────────────────────────────────────

function stepReputationDecay(state: GameState, gameTimeMs: number): StepResult {
  // Check if illicit in transit (resets the counter)
  const hasIllicitInTransit = state.shipmentsInTransit.some(s => s.isIllicit)
  if (hasIllicitInTransit) {
    return { state: { ...state, turnsWithoutIllicitActivity: 0 }, events: [] }
  }

  if (state.turnsWithoutIllicitActivity >= 3) {
    const newRep = Math.max(0, state.reputation - 2)
    return {
      state: {
        ...state,
        reputation: newRep,
        turnsWithoutIllicitActivity: state.turnsWithoutIllicitActivity + 1,
      },
      events: [evt(gameTimeMs,
        `No illicit activity for ${state.turnsWithoutIllicitActivity} weeks. Rep -2.`,
        'warning')],
    }
  }

  return {
    state: { ...state, turnsWithoutIllicitActivity: state.turnsWithoutIllicitActivity + 1 },
    events: [],
  }
}

// ─── Step 9: End turn / week ──────────────────────────────────────────────────

function stepEndTurn(state: GameState, gameTimeMs: number): StepResult {
  const events: LiveEvent[] = []

  const updatedContracts = state.contracts.map(c => ({
    ...c,
    deadline: c.isAssigned ? c.deadline - 1 : Math.max(0, c.deadline - 1),
  }))

  const updatedRoutes = state.routes.map(r => {
    // Routes with openAtMs are opened by the real-time clock (useGameClock), not here
    if (r.status === 'pending' && r.openAtMs !== null) {
      return r
    }
    if (r.status === 'pending' && r.turnsUntilOpen !== null) {
      const newTurns = r.turnsUntilOpen - 1
      if (newTurns <= 0) {
        events.push(evt(gameTimeMs, `Route open: ${route$(r.origin, r.destination)}`, 'success'))
        return { ...r, status: 'open' as const, turnsUntilOpen: null }
      }
      return { ...r, turnsUntilOpen: newTurns }
    }
    if (r.flaggedTurnsRemaining > 0) {
      const remaining = r.flaggedTurnsRemaining - 1
      if (remaining === 0) {
        events.push(evt(gameTimeMs, `Investigation lifted: ${route$(r.origin, r.destination)}`, 'info'))
      }
      return { ...r, flaggedTurnsRemaining: remaining }
    }
    return r
  })

  // Advance weather: activate forecasts (set clearAtMs), tick down, expire finished ones
  // Active storms last 2 game days (~34 real seconds) from activation
  const STORM_ACTIVE_MS = (WEEK_MS / 7) * 2  // 2 game days
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

// ─── Check win / lose ─────────────────────────────────────────────────────────

import { getNetWorth } from './gameState'

export function checkWinLose(state: GameState): GameState {
  if (state.winState !== null) return state

  if (state.cash <= 0) {
    return { ...state, phase: 'game_over', winState: 'lose_bankrupt' }
  }
  if (state.reputation <= 0) {
    return { ...state, phase: 'game_over', winState: 'lose_reputation' }
  }
  if (getNetWorth(state) >= 100000) {
    return { ...state, phase: 'game_over', winState: 'win_networth' }
  }
  if (state.reputation >= 80) {
    return { ...state, phase: 'game_over', winState: 'win_reputation' }
  }
  return state
}

// ─── Weekly tick (fires at each week boundary) ────────────────────────────────

export function resolveWeeklyTick(
  state: GameState,
  weekNumber: number,
  gameTimeMs: number,
): { state: GameState; summary: WeeklySummary } {
  if (state.phase === 'game_over') return { state, summary: buildEmptySummary(weekNumber) }

  const cashStart = state.cash
  const repStart = state.reputation
  const heatStart = state.globalHeat
  const openAtStart = new Set(state.routes.filter(r => r.status === 'open').map(r => r.id))

  const steps = [
    (s: GameState) => stepForecast(s, gameTimeMs),
    (s: GameState) => stepPayFixedCosts(s, gameTimeMs),
    (s: GameState) => stepAdvanceShipments(s, gameTimeMs),
    (s: GameState) => stepRefreshContracts(s, gameTimeMs),
    (s: GameState) => stepMoveInvestigator(s, gameTimeMs),
    (s: GameState) => stepDecayRouteHeat(s, gameTimeMs),
    (s: GameState) => stepDecayGlobalHeat(s, gameTimeMs),
    (s: GameState) => stepReputationDecay(s, gameTimeMs),
    (s: GameState) => stepEndTurn(s, gameTimeMs),
  ]

  let current = state
  const allEvents: LiveEvent[] = []

  for (const step of steps) {
    const result = step(current)
    current = result.state
    allEvents.push(...result.events)
  }

  // Build weekly summary using accumulated weeklyStats (from deliveries) + weekly-tick changes
  const ws = state.weeklyStats
  const cashAfterCosts = cashStart - (cashStart - current.cash + ws.deliveryIncome) // costs only
  const fixedCosts = Math.max(0, cashStart - cashAfterCosts)

  const summary: WeeklySummary = {
    weekNumber,
    fixedCosts,
    deliveryIncome: ws.deliveryIncome,
    netCashChange: current.cash - cashStart,
    repChange: current.reputation - repStart,
    heatChange: current.globalHeat - heatStart,
    contractsCompleted: ws.contractsCompleted,
    busts: ws.busts,
    routesOpened: current.routes
      .filter(r => r.status === 'open' && !openAtStart.has(r.id))
      .map(r => route$(r.origin, r.destination)),
    completedDeliveries: ws.deliveries,
  }

  // Reset weeklyStats for the new week
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
  return {
    weekNumber,
    fixedCosts: 0,
    deliveryIncome: 0,
    netCashChange: 0,
    repChange: 0,
    heatChange: 0,
    contractsCompleted: 0,
    busts: 0,
    routesOpened: [],
    completedDeliveries: [],
  }
}

// ─── Arrival resolution (fires when a shipment reaches its destination) ───────

const PIRACY_CHANCE = 0.08

export function resolveArrival(
  state: GameState,
  shipmentId: string,
  gameTimeMs: number,
): { state: GameState; events: LiveEvent[] } {
  if (state.phase === 'game_over') return { state, events: [] }

  const shipment = state.shipmentsInTransit.find(s => s.id === shipmentId)
  if (!shipment) return { state, events: [] }

  const contract = state.contracts.find(c => c.id === shipment.contractId)
  if (!contract) return { state, events: [] }

  const events: LiveEvent[] = []
  let newCash = state.cash
  let newReputation = state.reputation
  let newGlobalHeat = state.globalHeat
  let updatedRoutes = state.routes
  const updatedFleet = [...state.fleet]

  // Free the vehicle
  const vi = updatedFleet.findIndex(v => v.id === shipment.vehicleId)
  if (vi !== -1) {
    updatedFleet[vi] = { ...updatedFleet[vi]!, isAssigned: false, currentShipmentId: null }
  }

  const route = state.routes.find(r => r.id === shipment.routeId)
  let bustsThisArrival = 0

  const leg = route$(contract.origin, contract.destination)

  if (!shipment.isIllicit) {
    newCash += contract.payout
    events.push(evt(gameTimeMs,
      `${leg} — delivered. +$${contract.payout.toLocaleString()}`,
      'success'))
  } else {
    const vehicle = state.fleet.find(v => v.id === shipment.vehicleId)
    const isPiracyRoute = route !== undefined &&
      (route.tier === 'international' || route.tier === 'long_haul')

    if (vehicle?.type === 'ship' && isPiracyRoute && Math.random() < PIRACY_CHANCE) {
      events.push(evt(gameTimeMs,
        `Piracy: ${leg}. Cargo lost.`,
        'warning'))
    } else {
      const prob = route ? detectionChance(route, newGlobalHeat, state.investigator.currentCityId) : 0
      const caught = Math.random() < prob

      if (caught) {
        bustsThisArrival = 1
        newReputation = Math.max(0, newReputation - 10)
        newGlobalHeat = Math.min(100, newGlobalHeat + 12)
        if (route) {
          updatedRoutes = updatedRoutes.map(r =>
            r.id === route.id
              ? { ...r, heat: Math.min(5, r.heat + 2), flaggedTurnsRemaining: 3, consecutiveIllicitRuns: 0 }
              : r,
          )
        }
        events.push(evt(gameTimeMs,
          `Busted: ${leg}. -10 rep, route flagged 3 weeks.`,
          'danger'))
      } else {
        newCash += contract.payout
        newGlobalHeat = Math.min(100, newGlobalHeat + 2)
        const gain = contract.repReward ?? 1
        if (gain > 0) {
          newReputation = Math.min(100, newReputation + gain)
        }
        const probPct = Math.round(prob * 100)
        const repStr = gain > 0 ? `, +${gain} rep` : ''
        events.push(evt(gameTimeMs,
          `${leg} — cleared. +$${contract.payout.toLocaleString()}${repStr} (${probPct}% risk)`,
          'success'))
      }
    }
  }

  const updatedShipments = state.shipmentsInTransit.filter(s => s.id !== shipmentId)
  const updatedContracts = state.contracts.filter(c => c.id !== shipment.contractId)

  // Update weeklyStats accumulator
  const ws = state.weeklyStats
  const record: DeliveryRecord = {
    origin: getCityName(contract.origin),
    destination: getCityName(contract.destination),
    payout: bustsThisArrival > 0 ? 0 : contract.payout,
    isIllicit: shipment.isIllicit,
    cargoType: contract.cargoType,
    wasBust: bustsThisArrival > 0,
  }
  const newWeeklyStats = {
    deliveryIncome: ws.deliveryIncome + (newCash - state.cash),
    contractsCompleted: ws.contractsCompleted + 1,
    busts: ws.busts + bustsThisArrival,
    repFromDeliveries: ws.repFromDeliveries + (newReputation - state.reputation),
    heatFromDeliveries: ws.heatFromDeliveries + (newGlobalHeat - state.globalHeat),
    deliveries: [...ws.deliveries, record],
  }

  let next: GameState = {
    ...state,
    cash: newCash,
    reputation: newReputation,
    globalHeat: newGlobalHeat,
    routes: updatedRoutes,
    shipmentsInTransit: updatedShipments,
    contracts: updatedContracts,
    fleet: updatedFleet,
    turnsWithoutIllicitActivity: shipment.isIllicit ? 0 : state.turnsWithoutIllicitActivity,
    weeklyStats: newWeeklyStats,
  }
  next = appendEvents(next, events)
  next = checkWinLose(next)

  return { state: next, events }
}
