import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { saveStorage } from './saveStorage'
import type { GameState, Vehicle, VehicleType, Route, RouteTier, ShipmentInTransit, UpgradeType } from '../engine/gameState'
import { VEHICLE_SPECS, ROUTE_COSTS, getNetWorth, canEstablishRoute, DEFAULT_UPGRADES, DEFAULT_LIFETIME_STATS } from '../engine/gameState'
import { resolveWeeklyTick, resolveArrival, resolveSmuggleHopArrival } from '../engine/turnEngine'
import { generateContracts } from '../engine/contracts'
import { getAllRoutes } from '../data/routes'
import { DAY_MS } from '../engine/constants'
import { getCityName } from '../data/cities'
import { CONFIG } from '../engine/config'
import { bumpStats, bumpCommoditySmuggled, peakStats } from './statsHelpers'
import { createVehicleActions, resetVehicleCounter } from './vehicleActions'
import { createSmuggleActions } from './smuggleActions'
import { createSkillActions } from './skillActions'

export type { SmuggleRunConfig } from './smuggleActions'
import type { SmuggleRunConfig } from './smuggleActions'

export interface ThreatAlert {
  id: string
  vehicleId: string
  vehicleName: string
  vehicleType: VehicleType
  fine: number
  expiresOnTurn: number
  reason: 'bust' | 'piracy' | 'rival'
}

// ─── Shared game-time snapshot (updated by useGameClock, read by assignVehicle) ─
export let currentGameTimeMs = 0
export function setCurrentGameTimeMs(ms: number): void {
  currentGameTimeMs = ms
}

// ─── Initial state factory ────────────────────────────────────────────────────

function makeStartingTrucks(): Vehicle[] {
  const shared = {
    ...VEHICLE_SPECS.truck,
    isAssigned: false,
    currentShipmentId: null,
    upgrades: { ...DEFAULT_UPGRADES },
    isImpounded: false,
    impoundFine: null,
    impoundExpiresOnTurn: null,
    impoundReason: null,
  }
  return [
    { id: 'truck_01', type: 'truck', name: 'Truck #1', ...shared },
    { id: 'truck_02', type: 'truck', name: 'Truck #2', ...shared },
  ]
}

function createInitialState(): GameState {
  const base: GameState = {
    cash: CONFIG.start.cash,
    reputation: CONFIG.start.reputation,
    globalHeat: CONFIG.start.globalHeat,
    turn: 1,
    fleet: makeStartingTrucks(),
    routes: getAllRoutes(),
    contracts: [],
    shipmentsInTransit: [],
    weatherEvents: [],
    inspector: {
      currentCityId: null,
      appearsOnTurn: CONFIG.inspector.appearsOnTurn,
      probableNextCityId: null,
      isTrackedByInformant: false,
      additionalCityIds: [],
    },
    interpol: {
      currentCityId: null,
      appearsOnTurn: CONFIG.interpol.appearsOnTurn,
      probableNextCityId: null,
      isTrackedByInformant: false,
      additionalCityIds: [],
    },
    events: [],
    phase: 'player_actions',
    winState: null,
    turnsWithoutIllicitActivity: 0,
    pendingRouteEstablishments: [],
    lastWeeklySummary: null,
    weeklyStats: { deliveryIncome: 0, contractsCompleted: 0, busts: 0, repFromDeliveries: 0, heatFromDeliveries: 0, deliveries: [] },
    gameVersion: 0,
    unlockedSkills: [],
    profitHistory: [],
    hasCompletedFirstIllicit: false,
    lastLayLowTurn: 0,
    cityInventory: {},
    smuggleRuns: [],
    lifetimeStats: { ...DEFAULT_LIFETIME_STATS },
  }
  return { ...base, contracts: generateContracts(base) }
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface GameStore {
  gameState: GameState

  // Game clock
  isPaused: boolean
  togglePause: () => void
  gameSpeed: 1 | 2 | 4
  cycleSpeed: () => void
  hasStarted: boolean
  startGame: () => void
  savedTimeMs: number

  // Real-time actions (called by useGameClock)
  weeklyTick: (weekNumber: number, gameTimeMs: number) => void
  resolveArrival: (shipmentId: string, gameTimeMs: number) => void
  openPendingRoute: (routeId: string, gameTimeMs: number) => void
  clearWeatherEvent: (eventId: string, now: number) => void

  // Player actions
  newGame: () => void
  buyVehicle: (type: VehicleType) => void
  establishRoute: (routeId: string) => void
  assignVehicle: (contractId: string, vehicleId: string, legIndex?: number) => void
  clearWeeklySummary: () => void

  // Vehicle upgrades
  upgradeVehicle: (vehicleId: string, upgradeType: UpgradeType) => void

  // Recurring contract management
  cancelRecurringContract: (contractId: string) => void

  // Cancel any assigned contract (frees all vehicles)
  cancelContract: (contractId: string) => void

  // Contract decline (unassigned)
  declineContract: (contractId: string) => void

  // Impound recovery
  payImpoundFine: (vehicleId: string) => void

  // Sell vehicle
  sellVehicle: (vehicleId: string) => void

  // Heat management
  payDownHeat: () => void

  // Skill tree
  unlockSkill: (skillId: string) => void

  // Commodity smuggling
  purchaseCommodity: (cityId: string, commodityKey: string, quantity: number) => void
  launchSmuggleRun: (config: SmuggleRunConfig) => void

  // Threat alerts (vehicle impounded mid-game)
  threatAlerts: ThreatAlert[]
  dismissThreatAlert: (alertId: string) => void

  // Derived
  netWorth: () => number
}

// ─── Store ────────────────────────────────────────────────────────────────────

// ── Helper: detect newly impounded vehicles and build alerts ─────────────────
function detectNewImpounds(prevFleet: Vehicle[], nextFleet: Vehicle[], gameTimeMs: number): ThreatAlert[] {
  const prevImpoundedIds = new Set(prevFleet.filter(v => v.isImpounded).map(v => v.id))
  return nextFleet
    .filter(v => v.isImpounded && !prevImpoundedIds.has(v.id) && v.impoundFine !== null && v.impoundExpiresOnTurn !== null)
    .map(v => ({
      id: `alert_${v.id}_${gameTimeMs}`,
      vehicleId: v.id,
      vehicleName: v.name,
      vehicleType: v.type,
      fine: v.impoundFine!,
      expiresOnTurn: v.impoundExpiresOnTurn!,
      reason: (v.impoundReason ?? 'rival') as 'bust' | 'piracy' | 'rival',
    }))
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => {
  // Wrappers for action modules (they only need gameState access)
  const stateGet = () => ({ gameState: get().gameState })
  const stateSet = (u: { gameState: GameState }) => set(u)

  return {
  gameState: createInitialState(),
  isPaused: false,
  gameSpeed: 1,
  hasStarted: false,
  savedTimeMs: 0,
  threatAlerts: [],

  togglePause: () => set(s => ({
    isPaused: !s.isPaused,
    // Snapshot the clock whenever the player pauses so restores land at the right time
    savedTimeMs: !s.isPaused ? currentGameTimeMs : s.savedTimeMs,
  })),
  cycleSpeed: () => set(s => ({ gameSpeed: s.gameSpeed === 1 ? 2 : s.gameSpeed === 2 ? 4 : 1 })),
  startGame: () => set({ hasStarted: true }),

  // Extracted action modules
  ...createVehicleActions(stateGet, stateSet),
  ...createSmuggleActions(stateGet, stateSet),
  ...createSkillActions(stateGet, stateSet),

  weeklyTick: (weekNumber, gameTimeMs) => {
    const { gameState } = get()
    if (gameState.phase === 'game_over') return
    let { state } = resolveWeeklyTick(gameState, weekNumber, gameTimeMs)

    // Track sabotage (compare fleet impound states)
    const newSabotage = state.fleet.filter(v => v.isImpounded && !gameState.fleet.find(f => f.id === v.id)?.isImpounded).length
    // Track vehicles lost (fleet shrunk from impound expiry)
    const vehiclesLost = gameState.fleet.length - state.fleet.length
    // Track spending (maintenance deducted in weeklyTick)
    const maintenanceSpent = Math.max(0, gameState.cash - state.cash)

    let stats = state.lifetimeStats
    if (newSabotage > 0) stats = bumpStats(stats, { timesSabotaged: newSabotage })
    if (vehiclesLost > 0) stats = bumpStats(stats, { vehiclesLost })
    if (maintenanceSpent > 0) stats = bumpStats(stats, { totalMoneySpent: maintenanceSpent })
    state = { ...state, lifetimeStats: stats }
    state = { ...state, lifetimeStats: peakStats(state) }

    const newAlerts = detectNewImpounds(gameState.fleet, state.fleet, gameTimeMs)
    set(s => ({
      gameState: state,
      threatAlerts: [...s.threatAlerts, ...newAlerts],
      isPaused: newAlerts.length > 0 ? true : s.isPaused,
      savedTimeMs: gameTimeMs,
    }))
  },

  resolveArrival: (shipmentId, gameTimeMs) => {
    const { gameState } = get()
    if (gameState.phase === 'game_over') return

    // Route smuggle shipments to the smuggle resolver
    const shipment = gameState.shipmentsInTransit.find(s => s.id === shipmentId)
    const isSmuggle = shipment?.smuggleRunId != null

    let { state } = isSmuggle
      ? resolveSmuggleHopArrival(gameState, shipmentId, gameTimeMs)
      : resolveArrival(gameState, shipmentId, gameTimeMs)

    // Track earnings, busts, completions from the arrival
    const cashDelta = state.cash - gameState.cash
    let stats = state.lifetimeStats
    if (cashDelta > 0) {
      stats = bumpStats(stats, { totalMoneyEarned: cashDelta })
      // Track largest payouts
      if (isSmuggle) {
        stats = { ...stats, largestSmugglePayout: Math.max(stats.largestSmugglePayout, cashDelta) }
        // Check if a smuggle run just completed
        const completedRun = state.smuggleRuns.find(r =>
          r.status === 'completed' && !gameState.smuggleRuns.find(gr => gr.id === r.id && gr.status === 'completed'),
        )
        if (completedRun) {
          stats = bumpStats(stats, { smuggleRunsCompleted: 1 })
          stats = bumpCommoditySmuggled(stats, completedRun.commodityKey, completedRun.volume)
        }
      } else {
        stats = { ...stats, largestContractPayout: Math.max(stats.largestContractPayout, cashDelta) }
        stats = bumpStats(stats, { legitDeliveriesCompleted: 1, totalLegitCargoDelivered: 1 })
      }
    }
    // Track busts
    const newBusts = state.weeklyStats.busts - gameState.weeklyStats.busts
    if (newBusts > 0) {
      stats = bumpStats(stats, { timesBusted: newBusts })
      if (isSmuggle) stats = bumpStats(stats, { smuggleRunsBusted: newBusts })
    }
    // Track close calls (smuggle hop cleared with >= 30% risk)
    if (isSmuggle && cashDelta >= 0 && newBusts === 0) {
      const lastDelivery = state.weeklyStats.deliveries[state.weeklyStats.deliveries.length - 1]
      if (lastDelivery?.risk != null && lastDelivery.risk >= 0.30 && !lastDelivery.wasBust) {
        stats = bumpStats(stats, { closeCalls: 1 })
      }
    }
    // Track vehicles lost
    const vLost = gameState.fleet.length - state.fleet.length
    if (vLost > 0) stats = bumpStats(stats, { vehiclesLost: vLost })

    state = { ...state, lifetimeStats: stats }
    state = { ...state, lifetimeStats: peakStats(state) }

    const newAlerts = detectNewImpounds(gameState.fleet, state.fleet, gameTimeMs)
    set(s => ({
      gameState: state,
      threatAlerts: [...s.threatAlerts, ...newAlerts],
      isPaused: newAlerts.length > 0 ? true : s.isPaused,
    }))
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

  clearWeatherEvent: (eventId, now) => {
    set(s => {
      const event = s.gameState.weatherEvents.find(e => e.id === eventId)
      if (!event) return s

      const stormActiveSinceMs = event.clearAtMs != null
        ? event.clearAtMs - DAY_MS * CONFIG.weather.activeDurationDays
        : now
      const affectedRouteIds = new Set(event.affectedRouteIds)

      const updatedShipments = s.gameState.shipmentsInTransit.map(shipment => {
        if (!affectedRouteIds.has(shipment.routeId)) return shipment
        const freezeStart = Math.max(shipment.departureTimeMs, stormActiveSinceMs)
        const additionalFreeze = Math.max(0, now - freezeStart)
        if (additionalFreeze === 0) return shipment
        return { ...shipment, frozenDurationMs: shipment.frozenDurationMs + additionalFreeze }
      })

      return {
        gameState: {
          ...s.gameState,
          weatherEvents: s.gameState.weatherEvents.filter(e => e.id !== eventId),
          shipmentsInTransit: updatedShipments,
        },
      }
    })
  },

  dismissThreatAlert: (alertId) => {
    set(s => {
      const remaining = s.threatAlerts.filter(a => a.id !== alertId)
      return { threatAlerts: remaining, isPaused: remaining.length > 0 ? true : false }
    })
  },

  newGame: () => {
    resetVehicleCounter()
    currentGameTimeMs = 0
    const initialState = createInitialState()
    set({
      gameState: { ...initialState, gameVersion: (get().gameState.gameVersion ?? 0) + 1 },
      isPaused: false,
      gameSpeed: 1,
      hasStarted: false,
      threatAlerts: [],
      savedTimeMs: 0,
    })
    // Wipe the persisted save so the next load starts fresh
    saveStorage.removeItem('cb_sv')
  },

  clearWeeklySummary: () => {
    set(s => ({ gameState: { ...s.gameState, lastWeeklySummary: null } }))
  },

  establishRoute: (routeId: string) => {
    const { gameState } = get()
    const route = gameState.routes.find(r => r.id === routeId)
    if (!route) return

    const eligibility = canEstablishRoute(route, gameState)
    if (!eligibility.ok) return

    const cost = ROUTE_COSTS[route.tier].establish
    if (gameState.cash < cost) return

    const pendingDays = CONFIG.routes.pendingDays[route.tier as RouteTier]
    const openAt = currentGameTimeMs + pendingDays * DAY_MS

    const reverseId = `route_${route.destination}_${route.origin}`
    const reverseRoute = gameState.routes.find(r => r.id === reverseId && r.status === 'closed')

    const updatedRoutes: Route[] = gameState.routes.map(r => {
      if (r.id === routeId || r.id === reverseId) {
        if (r.id === routeId || reverseRoute) {
          return { ...r, status: 'pending' as const, turnsUntilOpen: null, openAtMs: openAt }
        }
      }
      return r
    })

    const newEvent = {
      id: `e_est_${routeId}`,
      gameTimeMs: currentGameTimeMs,
      message: `Establishing ${getCityName(route.origin)} ↔ ${getCityName(route.destination)}. Opens in ${pendingDays} day${pendingDays !== 1 ? 's' : ''}. -$${cost.toLocaleString()}`,
      type: 'info' as const,
    }

    set({
      gameState: {
        ...gameState,
        cash: gameState.cash - cost,
        routes: updatedRoutes,
        events: [...gameState.events, newEvent].slice(-50),
        lifetimeStats: bumpStats(gameState.lifetimeStats, { totalMoneySpent: cost, routesEstablished: 1 }),
      },
    })
  },


  assignVehicle: (contractId: string, vehicleId: string, legIndex = 0) => {
    const { gameState } = get()
    const contract = gameState.contracts.find(c => c.id === contractId)
    const vehicle = gameState.fleet.find(v => v.id === vehicleId)

    if (!contract || !vehicle || vehicle.isImpounded) return
    // Vehicle must be idle (not assigned to another contract or reserved for another leg)
    if (vehicle.isAssigned) return

    const leg = contract.legs[legIndex]
    if (!leg) return

    // Don't over-assign convoy legs
    if (leg.assignedVehicleIds.length >= contract.requiredVehicleCount) return
    // Don't re-assign dispatched legs
    if (leg.shipmentIds.length > 0) return

    const route = gameState.routes.find(r =>
      r.status === 'open' &&
      r.origin === leg.origin &&
      r.destination === leg.destination &&
      r.allowedVehicles.includes(vehicle.type),
    )
    if (!route) return

    // Check vehicle upgrade requirements
    const reqs = contract.vehicleRequirements
    if (reqs.range && vehicle.upgrades.range < reqs.range) return
    if (reqs.concealment && vehicle.upgrades.concealment < reqs.concealment) return
    if (reqs.cargo && vehicle.upgrades.cargo < reqs.cargo) return
    if (reqs.engine && vehicle.upgrades.engine < reqs.engine) return

    // Check skill requirements
    for (const skill of contract.requiredSkills) {
      if (!gameState.unlockedSkills.includes(skill)) return
    }

    const travelDays = route.travelDays[vehicle.type]
    if (!travelDays) return

    // Update leg assignment
    let updatedLegs = contract.legs.map((l, i) =>
      i === legIndex
        ? { ...l, assignedVehicleIds: [...l.assignedVehicleIds, vehicleId] }
        : l,
    )

    let newShipments = [...gameState.shipmentsInTransit]
    let updatedFleet = gameState.fleet.map(v =>
      v.id === vehicleId ? { ...v, isAssigned: true } : v,
    )
    let updatedRoutes = gameState.routes

    // Dispatch shipment if: leg 0 (always immediate), or previous leg already complete
    const prevLegComplete = legIndex === 0 ||
      (contract.legs[legIndex - 1]?.completedAt !== null)

    if (prevLegComplete) {
      const shipmentId = `ship_${Date.now()}_l${legIndex}`
      const shipment: ShipmentInTransit = {
        id: shipmentId,
        contractId: contract.id,
        vehicleId: vehicle.id,
        routeId: route.id,
        legIndex,
        turnsRemaining: travelDays,
        totalTurns: travelDays,
        isIllicit: contract.isIllicit,
        isFrozen: false,
        departureTimeMs: currentGameTimeMs,
        frozenDurationMs: 0,
        smuggleRunId: null,
        reversed: false,
      }
      newShipments = [...newShipments, shipment]
      updatedLegs = updatedLegs.map((l, i) =>
        i === legIndex
          ? { ...l, shipmentIds: [...l.shipmentIds, shipmentId] }
          : l,
      )
      updatedFleet = updatedFleet.map(v =>
        v.id === vehicleId ? { ...v, currentShipmentId: shipmentId } : v,
      )

      // Route heat & consecutiveIllicitRuns are incremented on arrival
      // (in arrivalResolver) AFTER the detection roll — not here at dispatch.
    }

    const contractIsNowAssigned = updatedLegs.every(
      l => l.assignedVehicleIds.length >= contract.requiredVehicleCount,
    )

    const legLabel = legIndex === 0
      ? `${getCityName(leg.origin)} → ${getCityName(leg.destination)}`
      : `Leg ${legIndex + 1}: ${getCityName(leg.origin)} → ${getCityName(leg.destination)}`
    const dispatchMsg = prevLegComplete
      ? `${vehicle.name} dispatched: ${legLabel} (${travelDays} day${travelDays > 1 ? 's' : ''}).`
      : `${vehicle.name} reserved for ${legLabel} — awaiting leg ${legIndex} arrival.`

    const newEvent = {
      id: `e_assign_${contractId}_l${legIndex}_${Date.now()}`,
      gameTimeMs: currentGameTimeMs,
      message: dispatchMsg,
      type: 'info' as const,
    }

    set({
      gameState: {
        ...gameState,
        routes: updatedRoutes,
        contracts: gameState.contracts.map(c =>
          c.id === contractId
            ? {
                ...c,
                isAssigned: contractIsNowAssigned,
                assignedVehicleId: updatedLegs[0]?.assignedVehicleIds[0] ?? null,
                legs: updatedLegs,
              }
            : c,
        ),
        fleet: updatedFleet,
        shipmentsInTransit: newShipments,
        events: [...gameState.events, newEvent].slice(-50),
      },
    })
  },

  cancelRecurringContract: (contractId) => {
    const { gameState } = get()
    const contract = gameState.contracts.find(c => c.id === contractId)
    if (!contract || !contract.isRecurring) return

    const shipment = gameState.shipmentsInTransit.find(s => s.contractId === contractId)
    const vehicle = shipment ? gameState.fleet.find(v => v.id === shipment.vehicleId) : null

    const newEvent = {
      id: `e_cancel_${contractId}_${currentGameTimeMs}`,
      gameTimeMs: currentGameTimeMs,
      message: `Recurring contract cancelled${vehicle ? ` — ${vehicle.name} is now idle` : ''}.`,
      type: 'info' as const,
    }

    set({
      gameState: {
        ...gameState,
        contracts: gameState.contracts.filter(c => c.id !== contractId),
        shipmentsInTransit: gameState.shipmentsInTransit.filter(s => s.contractId !== contractId),
        fleet: gameState.fleet.map(v =>
          vehicle && v.id === vehicle.id
            ? { ...v, isAssigned: false, currentShipmentId: null }
            : v,
        ),
        events: [...gameState.events, newEvent].slice(-50),
      },
    })
  },

  cancelContract: (contractId) => {
    const { gameState } = get()
    const contract = gameState.contracts.find(c => c.id === contractId)
    if (!contract) return

    // Collect all vehicle IDs across all legs
    const allVehicleIds = new Set(contract.legs.flatMap(l => l.assignedVehicleIds))
    const activeShipmentIds = new Set(contract.legs.flatMap(l => l.shipmentIds))

    const newEvent = {
      id: `e_cancel_${contractId}_${currentGameTimeMs}`,
      gameTimeMs: currentGameTimeMs,
      message: `Contract cancelled: ${getCityName(contract.origin)} → ${getCityName(contract.destination)}.`,
      type: 'info' as const,
    }

    set({
      gameState: {
        ...gameState,
        contracts: gameState.contracts.filter(c => c.id !== contractId),
        shipmentsInTransit: gameState.shipmentsInTransit.filter(s => !activeShipmentIds.has(s.id)),
        fleet: gameState.fleet.map(v =>
          allVehicleIds.has(v.id)
            ? { ...v, isAssigned: false, currentShipmentId: null }
            : v,
        ),
        events: [...gameState.events, newEvent].slice(-50),
      },
    })
  },

  declineContract: (contractId: string) => {
    set(s => ({
      gameState: {
        ...s.gameState,
        contracts: s.gameState.contracts.filter(c => c.id !== contractId),
      },
    }))
  },

  netWorth: () => getNetWorth(get().gameState),
}
    },
    {
      name: 'cb_sv',
      storage: createJSONStorage(() => saveStorage),
      partialize: (s) => ({
        gameState:    s.gameState,
        hasStarted:   s.hasStarted,
        isPaused:     true,        // always restore paused regardless of how player left
        gameSpeed:    s.gameSpeed,
        threatAlerts: s.threatAlerts,
        savedTimeMs:  s.savedTimeMs,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.savedTimeMs) setCurrentGameTimeMs(state.savedTimeMs)
      },
    },
  ),
)
