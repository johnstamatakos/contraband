import { create } from 'zustand'
import type { GameState, Vehicle, VehicleType, Route, RouteTier, ShipmentInTransit } from '../engine/gameState'
import { VEHICLE_SPECS, ROUTE_COSTS, getNetWorth, canEstablishRoute } from '../engine/gameState'
import { resolveWeeklyTick, resolveArrival } from '../engine/turnEngine'
import { generateContracts } from '../engine/contracts'
import { getAllRoutes } from '../data/routes'
import { DAY_MS } from '../engine/constants'
import { getCityName } from '../data/cities'

// ─── Shared game-time snapshot (updated by useGameClock, read by assignVehicle) ─
// Not in Zustand to avoid re-renders; module-level mutable.
export let currentGameTimeMs = 0
export function setCurrentGameTimeMs(ms: number): void {
  currentGameTimeMs = ms
}

// ─── Initial state factory ────────────────────────────────────────────────────

function makeStartingTruck(): Vehicle {
  return {
    id: 'truck_01',
    type: 'truck',
    name: 'Truck #1',
    ...VEHICLE_SPECS.truck,
    isAssigned: false,
    currentShipmentId: null,
  }
}

function createInitialState(): GameState {
  const base: GameState = {
    cash: 5000,
    reputation: 50,
    globalHeat: 0,
    turn: 1,
    fleet: [makeStartingTruck()],
    routes: getAllRoutes(),
    contracts: [],
    shipmentsInTransit: [],
    weatherEvents: [],
    contacts: [],
    investigator: {
      currentCityId: null,
      appearsOnTurn: 8,
      probableNextCityId: null,
      isTrackedByInformant: false,
    },
    events: [],
    phase: 'player_actions',
    winState: null,
    turnsWithoutIllicitActivity: 0,
    pendingRouteEstablishments: [],
    lastWeeklySummary: null,
    weeklyStats: { deliveryIncome: 0, contractsCompleted: 0, busts: 0, repFromDeliveries: 0, heatFromDeliveries: 0, deliveries: [] },
    gameVersion: 0,
  }
  return { ...base, contracts: generateContracts(base) }
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface GameStore {
  gameState: GameState

  // Game clock
  isPaused: boolean
  togglePause: () => void
  hasStarted: boolean
  startGame: () => void
  testMode: boolean

  // Real-time actions (called by useGameClock)
  weeklyTick: (weekNumber: number, gameTimeMs: number) => void
  resolveArrival: (shipmentId: string, gameTimeMs: number) => void
  openPendingRoute: (routeId: string, gameTimeMs: number) => void
  clearWeatherEvent: (eventId: string) => void

  // Player actions
  newGame: () => void
  buyVehicle: (type: VehicleType) => void
  establishRoute: (routeId: string) => void
  activateIllicitLayer: (routeId: string) => void
  assignVehicle: (contractId: string, vehicleId: string) => void
  clearWeeklySummary: () => void

  // Derived
  netWorth: () => number
}

// ─── Vehicle counter for unique IDs ──────────────────────────────────────────
let vehicleCounter = 2

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: createInitialState(),
  isPaused: false,
  hasStarted: false,
  testMode: false,

  togglePause: () => set(s => ({ isPaused: !s.isPaused })),
  startGame: () => set({ hasStarted: true }),

  weeklyTick: (weekNumber, gameTimeMs) => {
    const { gameState, testMode } = get()
    if (gameState.phase === 'game_over') return
    let { state } = resolveWeeklyTick(gameState, weekNumber, gameTimeMs)
    if (testMode && state.phase === 'game_over') state = { ...state, phase: 'playing', winState: null }
    set({ gameState: state })
    // isPaused stays as-is; the clock pauses because lastWeeklySummary !== null
  },

  resolveArrival: (shipmentId, gameTimeMs) => {
    const { gameState, testMode } = get()
    if (gameState.phase === 'game_over') return
    let { state } = resolveArrival(gameState, shipmentId, gameTimeMs)
    if (testMode && state.phase === 'game_over') state = { ...state, phase: 'playing', winState: null }
    set({ gameState: state })
  },

  openPendingRoute: (routeId, gameTimeMs) => {
    const { gameState } = get()
    const route = gameState.routes.find(r => r.id === routeId)
    if (!route || route.status !== 'pending') return
    const updatedRoutes = gameState.routes.map(r =>
      r.id === routeId
        ? { ...r, status: 'open' as const, openAtMs: null, turnsUntilOpen: null }
        : r,
    )
    const newEvent = {
      id: `e_open_${routeId}_${gameTimeMs}`,
      gameTimeMs,
      message: `Route open: ${getCityName(route.origin)} → ${getCityName(route.destination)}`,
      type: 'success' as const,
    }
    set({
      gameState: {
        ...gameState,
        routes: updatedRoutes,
        events: [...gameState.events.slice(-49), newEvent],
      },
    })
  },

  clearWeatherEvent: (eventId) => {
    set(s => ({
      gameState: {
        ...s.gameState,
        weatherEvents: s.gameState.weatherEvents.filter(e => e.id !== eventId),
      },
    }))
  },

  newGame: () => {
    vehicleCounter = 2
    currentGameTimeMs = 0
    const initialState = createInitialState()
    set({
      gameState: { ...initialState, gameVersion: (get().gameState.gameVersion ?? 0) + 1 },
      isPaused: false,
      hasStarted: false,
    })
  },

  clearWeeklySummary: () => {
    set(s => ({ gameState: { ...s.gameState, lastWeeklySummary: null } }))
  },

  buyVehicle: (type: VehicleType) => {
    const { gameState } = get()
    const spec = VEHICLE_SPECS[type]
    if (gameState.cash < spec.purchasePrice) return

    const id = `${type}_${String(vehicleCounter).padStart(2, '0')}`
    vehicleCounter++
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1)

    const vehicle: Vehicle = {
      id,
      type,
      name: `${typeLabel} #${vehicleCounter - 1}`,
      ...spec,
      isAssigned: false,
      currentShipmentId: null,
    }

    const newEvent = {
      id: `e_buy_${id}`,
      gameTimeMs: currentGameTimeMs,
      message: `Purchased ${vehicle.name} for $${spec.purchasePrice.toLocaleString()}.`,
      type: 'success' as const,
    }

    set({
      gameState: {
        ...gameState,
        cash: gameState.cash - spec.purchasePrice,
        fleet: [...gameState.fleet, vehicle],
        events: [...gameState.events, newEvent].slice(-50),
      },
    })
  },

  establishRoute: (routeId: string) => {
    const { gameState } = get()
    const route = gameState.routes.find(r => r.id === routeId)
    if (!route) return

    const eligibility = canEstablishRoute(route, gameState)
    if (!eligibility.ok) return

    const cost = ROUTE_COSTS[route.tier].establish
    if (gameState.cash < cost) return

    const updatedRoutes: Route[] = gameState.routes.map(r =>
      r.id === routeId
        ? { ...r, status: 'pending' as const, turnsUntilOpen: null, openAtMs: currentGameTimeMs + DAY_MS }
        : r,
    )

    const newEvent = {
      id: `e_est_${routeId}`,
      gameTimeMs: currentGameTimeMs,
      message: `Establishing ${getCityName(route.origin)} → ${getCityName(route.destination)}. Opens in 1 day. -$${cost.toLocaleString()}`,
      type: 'info' as const,
    }

    set({
      gameState: {
        ...gameState,
        cash: gameState.cash - cost,
        routes: updatedRoutes,
        events: [...gameState.events, newEvent].slice(-50),
      },
    })
  },

  activateIllicitLayer: (routeId: string) => {
    const { gameState } = get()
    const route = gameState.routes.find(r => r.id === routeId)
    if (!route || route.status !== 'open' || route.illicitLayerActive) return

    const cost = ROUTE_COSTS[route.tier as RouteTier].illicit
    if (gameState.cash < cost) return

    const updatedRoutes: Route[] = gameState.routes.map(r =>
      r.id === routeId ? { ...r, illicitLayerActive: true } : r,
    )

    const newEvent = {
      id: `e_illicit_${routeId}`,
      gameTimeMs: currentGameTimeMs,
      message: `Illicit layer activated: ${getCityName(route.origin)} → ${getCityName(route.destination)}. -$${cost.toLocaleString()}`,
      type: 'warning' as const,
    }

    set({
      gameState: {
        ...gameState,
        cash: gameState.cash - cost,
        routes: updatedRoutes,
        events: [...gameState.events, newEvent].slice(-50),
      },
    })
  },

  assignVehicle: (contractId: string, vehicleId: string) => {
    const { gameState } = get()
    const contract = gameState.contracts.find(c => c.id === contractId)
    const vehicle = gameState.fleet.find(v => v.id === vehicleId)

    if (!contract || !vehicle || vehicle.isAssigned || contract.isAssigned) return

    const route = gameState.routes.find(r =>
      r.status === 'open' &&
      r.origin === contract.origin &&
      r.destination === contract.destination &&
      r.allowedVehicles.includes(vehicle.type),
    )
    if (!route) return
    if (contract.isIllicit && !route.illicitLayerActive) return
    if (contract.isIllicit && route.flaggedTurnsRemaining > 0) return

    const travelDays = route.travelDays[vehicle.type]
    if (!travelDays) return

    const shipmentId = `ship_${Date.now()}`
    const shipment: ShipmentInTransit = {
      id: shipmentId,
      contractId: contract.id,
      vehicleId: vehicle.id,
      routeId: route.id,
      turnsRemaining: travelDays,
      totalTurns: travelDays,
      isIllicit: contract.isIllicit,
      isFrozen: false,
      departureTimeMs: currentGameTimeMs,
      frozenDurationMs: 0,
    }

    const updatedRoutes = contract.isIllicit
      ? gameState.routes.map(r =>
          r.id === route.id
            ? {
                ...r,
                heat: Math.min(5, r.heat + 1),
                consecutiveIllicitRuns: r.consecutiveIllicitRuns + 1,
                lastIllicitRunTurn: gameState.turn,
              }
            : r,
        )
      : gameState.routes

    const newEvent = {
      id: `e_assign_${shipmentId}`,
      gameTimeMs: currentGameTimeMs,
      message: `${vehicle.name} dispatched: ${getCityName(contract.origin)} → ${getCityName(contract.destination)} (${travelDays} day${travelDays > 1 ? 's' : ''}).`,
      type: 'info' as const,
    }

    set({
      gameState: {
        ...gameState,
        routes: updatedRoutes,
        contracts: gameState.contracts.map(c =>
          c.id === contractId ? { ...c, isAssigned: true, assignedVehicleId: vehicleId } : c,
        ),
        fleet: gameState.fleet.map(v =>
          v.id === vehicleId ? { ...v, isAssigned: true, currentShipmentId: shipmentId } : v,
        ),
        shipmentsInTransit: [...gameState.shipmentsInTransit, shipment],
        events: [...gameState.events, newEvent].slice(-50),
      },
    })
  },

  netWorth: () => getNetWorth(get().gameState),
}))
