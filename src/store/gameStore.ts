import { create } from 'zustand'
import type { GameState, Vehicle, VehicleType, Route, RouteTier, ShipmentInTransit } from '../engine/gameState'
import { VEHICLE_SPECS, ROUTE_COSTS, getNetWorth, canEstablishRoute, DEFAULT_UPGRADES } from '../engine/gameState'
import { SKILL_DEFS, SKILL_BY_ID } from '../data/skills'
import { resolveWeeklyTick, resolveArrival } from '../engine/turnEngine'
import { generateContracts } from '../engine/contracts'
import { getAllRoutes } from '../data/routes'
import { DAY_MS } from '../engine/constants'
import { getCityName } from '../data/cities'
import { CONFIG } from '../engine/config'

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
    upgrades: { ...DEFAULT_UPGRADES },
    isImpounded: false,
    impoundFine: null,
    impoundExpiresOnTurn: null,
  }
}

function createInitialState(): GameState {
  const base: GameState = {
    cash: CONFIG.start.cash,
    reputation: CONFIG.start.reputation,
    globalHeat: CONFIG.start.globalHeat,
    turn: 1,
    fleet: [makeStartingTruck()],
    routes: getAllRoutes(),
    contracts: [],
    shipmentsInTransit: [],
    weatherEvents: [],
    contacts: [],
    inspector: {
      currentCityId: null,
      appearsOnTurn: CONFIG.inspector.appearsOnTurn,
      probableNextCityId: null,
      isTrackedByInformant: false,
    },
    interpol: {
      currentCityId: null,
      appearsOnTurn: CONFIG.interpol.appearsOnTurn,
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
    unlockedSkills: [],
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
  testMode: boolean

  // Real-time actions (called by useGameClock)
  weeklyTick: (weekNumber: number, gameTimeMs: number) => void
  resolveArrival: (shipmentId: string, gameTimeMs: number) => void
  openPendingRoute: (routeId: string, gameTimeMs: number) => void
  clearWeatherEvent: (eventId: string, now: number) => void

  // Player actions
  newGame: () => void
  buyVehicle: (type: VehicleType) => void
  establishRoute: (routeId: string) => void
  activateIllicitLayer: (routeId: string) => void
  assignVehicle: (contractId: string, vehicleId: string) => void
  clearWeeklySummary: () => void

  // Vehicle upgrades
  upgradeVehicle: (vehicleId: string, upgradeType: 'cargo' | 'engine' | 'concealment') => void

  // Recurring contract management
  cancelRecurringContract: (contractId: string) => void

  // Impound recovery
  payImpoundFine: (vehicleId: string) => void

  // Skill tree
  unlockSkill: (skillId: string) => void

  // Derived
  netWorth: () => number
}

// ─── Vehicle counter for unique IDs ──────────────────────────────────────────
let vehicleCounter = 2

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: createInitialState(),
  isPaused: false,
  gameSpeed: 1,
  hasStarted: false,
  testMode: false,

  togglePause: () => set(s => ({ isPaused: !s.isPaused })),
  cycleSpeed: () => set(s => ({ gameSpeed: s.gameSpeed === 1 ? 2 : s.gameSpeed === 2 ? 4 : 1 })),
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

  clearWeatherEvent: (eventId, now) => {
    set(s => {
      const event = s.gameState.weatherEvents.find(e => e.id === eventId)
      if (!event) return s

      // Update frozenDurationMs on all shipments that were blocked by this storm.
      // stormActiveSinceMs is when isForecast flipped to false (one week before clearAtMs).
      const stormActiveSinceMs = event.clearAtMs != null
        ? event.clearAtMs - DAY_MS * CONFIG.weather.activeDurationDays
        : now
      const affectedRouteIds = new Set(event.affectedRouteIds)

      const updatedShipments = s.gameState.shipmentsInTransit.map(shipment => {
        if (!affectedRouteIds.has(shipment.routeId)) return shipment
        // Freeze started either when the storm activated or when the shipment departed,
        // whichever is later (handles shipments assigned mid-storm).
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

  newGame: () => {
    vehicleCounter = 2
    currentGameTimeMs = 0
    const initialState = createInitialState()
    set({
      gameState: { ...initialState, gameVersion: (get().gameState.gameVersion ?? 0) + 1 },
      isPaused: false,
      gameSpeed: 1,
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
      upgrades: { ...DEFAULT_UPGRADES },
      isImpounded: false,
      impoundFine: null,
      impoundExpiresOnTurn: null,
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

    // logistics_3: Trade Deals — route establishment cost multiplier
    const baseCost = ROUTE_COSTS[route.tier].establish
    const discount = gameState.unlockedSkills.includes('logistics_3')
      ? CONFIG.skills.effects.logistics_3.establishCostMultiplier
      : 1.0
    const cost = Math.round(baseCost * discount)
    if (gameState.cash < cost) return

    const pendingDays = CONFIG.routes.pendingDays[route.tier as RouteTier]
    const updatedRoutes: Route[] = gameState.routes.map(r =>
      r.id === routeId
        ? { ...r, status: 'pending' as const, turnsUntilOpen: null, openAtMs: currentGameTimeMs + pendingDays * DAY_MS }
        : r,
    )

    const newEvent = {
      id: `e_est_${routeId}`,
      gameTimeMs: currentGameTimeMs,
      message: `Establishing ${getCityName(route.origin)} → ${getCityName(route.destination)}. Opens in ${pendingDays} day${pendingDays !== 1 ? 's' : ''}. -$${cost.toLocaleString()}`,
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

    if (!contract || !vehicle || vehicle.isAssigned || vehicle.isImpounded || contract.isAssigned) return

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

  upgradeVehicle: (vehicleId, upgradeType) => {
    const { gameState } = get()
    const vehicle = gameState.fleet.find(v => v.id === vehicleId)
    if (!vehicle) return

    const currentTier = vehicle.upgrades[upgradeType]
    if (currentTier >= 2) return  // already maxed

    const nextTier = (currentTier + 1) as 1 | 2
    const fraction = nextTier === 1
      ? CONFIG.vehicleUpgrades.tier1CostFraction
      : CONFIG.vehicleUpgrades.tier2CostFraction
    const cost = Math.round(vehicle.purchasePrice * fraction)
    if (gameState.cash < cost) return

    const UPGRADE_LABELS = { cargo: 'Cargo Hold', engine: 'Engine', concealment: 'Concealment' }
    const newEvent = {
      id: `e_upgrade_${vehicleId}_${upgradeType}_${currentGameTimeMs}`,
      gameTimeMs: currentGameTimeMs,
      message: `${vehicle.name}: ${UPGRADE_LABELS[upgradeType]} upgraded to Tier ${nextTier}. -$${cost.toLocaleString()}`,
      type: 'success' as const,
    }

    set({
      gameState: {
        ...gameState,
        cash: gameState.cash - cost,
        fleet: gameState.fleet.map(v =>
          v.id === vehicleId
            ? { ...v, upgrades: { ...v.upgrades, [upgradeType]: nextTier } }
            : v,
        ),
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

  payImpoundFine: (vehicleId) => {
    const { gameState } = get()
    const vehicle = gameState.fleet.find(v => v.id === vehicleId)
    if (!vehicle || !vehicle.isImpounded || vehicle.impoundFine === null) return
    if (gameState.cash < vehicle.impoundFine) return

    const newEvent = {
      id: `e_impound_${vehicleId}_${currentGameTimeMs}`,
      gameTimeMs: currentGameTimeMs,
      message: `${vehicle.name} recovered from impound. -$${vehicle.impoundFine.toLocaleString()}`,
      type: 'success' as const,
    }

    set({
      gameState: {
        ...gameState,
        cash: gameState.cash - vehicle.impoundFine,
        fleet: gameState.fleet.map(v =>
          v.id === vehicleId
            ? { ...v, isImpounded: false, impoundFine: null, impoundExpiresOnTurn: null }
            : v,
        ),
        events: [...gameState.events, newEvent].slice(-50),
      },
    })
  },

  unlockSkill: (skillId) => {
    const { gameState } = get()
    const skill = SKILL_BY_ID.get(skillId)
    if (!skill) return
    if (gameState.unlockedSkills.includes(skillId)) return

    // Rep threshold
    const repRequired = CONFIG.skills.tierRepRequirements[`tier${skill.tier}` as 'tier1' | 'tier2' | 'tier3']
    if (gameState.reputation < repRequired) return

    // Must unlock previous tier in same branch first
    if (skill.tier > 1) {
      const prereqId = `${skill.branch}_${skill.tier - 1}`
      if (!gameState.unlockedSkills.includes(prereqId)) return
    }

    // Cash check
    const cost = CONFIG.skills.tierCashCosts[`tier${skill.tier}` as 'tier1' | 'tier2' | 'tier3']
    if (gameState.cash < cost) return

    const newEvent = {
      id: `e_skill_${skillId}_${currentGameTimeMs}`,
      gameTimeMs: currentGameTimeMs,
      message: `Skill unlocked: ${skill.name}`,
      type: 'success' as const,
    }

    set({
      gameState: {
        ...gameState,
        cash: gameState.cash - cost,
        unlockedSkills: [...gameState.unlockedSkills, skillId],
        events: [...gameState.events, newEvent].slice(-50),
      },
    })
  },

  netWorth: () => getNetWorth(get().gameState),
}))
