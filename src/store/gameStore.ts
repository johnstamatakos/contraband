import { create } from 'zustand'
import type { GameState, Vehicle, VehicleType, Route, RouteTier, ShipmentInTransit, UpgradeType } from '../engine/gameState'
import { VEHICLE_SPECS, ROUTE_COSTS, getNetWorth, canEstablishRoute, DEFAULT_UPGRADES } from '../engine/gameState'

export interface ThreatAlert {
  id: string
  vehicleId: string
  vehicleName: string
  vehicleType: VehicleType
  fine: number
  expiresOnTurn: number
}
import { SKILL_BY_ID } from '../data/skills'
import { resolveWeeklyTick, resolveArrival } from '../engine/turnEngine'
import { generateContracts } from '../engine/contracts'
import { getAllRoutes } from '../data/routes'
import { DAY_MS } from '../engine/constants'
import { getCityName } from '../data/cities'
import { CONFIG } from '../engine/config'

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
    recentIllicitCompletions: [],
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

  // Threat alerts (vehicle impounded mid-game)
  threatAlerts: ThreatAlert[]
  dismissThreatAlert: (alertId: string) => void

  // Derived
  netWorth: () => number
}

// ─── Vehicle counter for unique IDs ──────────────────────────────────────────
let vehicleCounter = 3

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
    }))
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: createInitialState(),
  isPaused: false,
  gameSpeed: 1,
  hasStarted: false,
  testMode: false,
  threatAlerts: [],

  togglePause: () => set(s => ({ isPaused: !s.isPaused })),
  cycleSpeed: () => set(s => ({ gameSpeed: s.gameSpeed === 1 ? 2 : s.gameSpeed === 2 ? 4 : 1 })),
  startGame: () => set({ hasStarted: true }),

  weeklyTick: (weekNumber, gameTimeMs) => {
    const { gameState, testMode } = get()
    if (gameState.phase === 'game_over') return
    let { state } = resolveWeeklyTick(gameState, weekNumber, gameTimeMs)
    if (testMode && state.phase === 'game_over') state = { ...state, phase: 'player_actions', winState: null }
    const newAlerts = detectNewImpounds(gameState.fleet, state.fleet, gameTimeMs)
    set(s => ({
      gameState: state,
      threatAlerts: [...s.threatAlerts, ...newAlerts],
      isPaused: newAlerts.length > 0 ? true : s.isPaused,
    }))
  },

  resolveArrival: (shipmentId, gameTimeMs) => {
    const { gameState, testMode } = get()
    if (gameState.phase === 'game_over') return
    let { state } = resolveArrival(gameState, shipmentId, gameTimeMs)
    if (testMode && state.phase === 'game_over') state = { ...state, phase: 'player_actions', winState: null }
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
    vehicleCounter = 3
    currentGameTimeMs = 0
    const initialState = createInitialState()
    set({
      gameState: { ...initialState, gameVersion: (get().gameState.gameVersion ?? 0) + 1 },
      isPaused: false,
      gameSpeed: 1,
      hasStarted: false,
      threatAlerts: [],
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
      },
    })
  },

  activateIllicitLayer: (routeId: string) => {
    const { gameState } = get()
    const route = gameState.routes.find(r => r.id === routeId)
    if (!route || route.status !== 'open' || route.illicitLayerActive) return

    const cost = ROUTE_COSTS[route.tier as RouteTier].illicit
    if (gameState.cash < cost) return

    const reverseId = `route_${route.destination}_${route.origin}`
    const updatedRoutes: Route[] = gameState.routes.map(r =>
      (r.id === routeId || r.id === reverseId) && r.status === 'open'
        ? { ...r, illicitLayerActive: true }
        : r,
    )

    const newEvent = {
      id: `e_illicit_${routeId}`,
      gameTimeMs: currentGameTimeMs,
      message: `Illicit layer activated: ${getCityName(route.origin)} ↔ ${getCityName(route.destination)}. -$${cost.toLocaleString()}`,
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
    if (contract.isIllicit && !route.illicitLayerActive) return
    if (contract.isIllicit && route.flaggedTurnsRemaining > 0) return

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

  upgradeVehicle: (vehicleId, upgradeType) => {
    const { gameState } = get()
    const vehicle = gameState.fleet.find(v => v.id === vehicleId)
    if (!vehicle) return

    const currentTier = vehicle.upgrades[upgradeType]
    if (currentTier >= 2) return

    const nextTier = (currentTier + 1) as 1 | 2
    const fraction = nextTier === 1
      ? CONFIG.vehicleUpgrades.tier1CostFraction
      : CONFIG.vehicleUpgrades.tier2CostFraction
    const cost = Math.round(vehicle.purchasePrice * fraction)
    if (gameState.cash < cost) return

    const UPGRADE_LABELS: Record<UpgradeType, string> = {
      cargo: 'Cargo Hold', engine: 'Engine', concealment: 'Concealment', range: 'Fuel Tank',
    }
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

  sellVehicle: (vehicleId) => {
    const { gameState } = get()
    const vehicle = gameState.fleet.find(v => v.id === vehicleId)
    if (!vehicle) return
    if (vehicle.isAssigned || vehicle.isImpounded) return
    const availableCount = gameState.fleet.filter(v => !v.isImpounded).length
    if (availableCount <= 1) return

    const newEvent = {
      id: `e_sell_${vehicleId}_${currentGameTimeMs}`,
      gameTimeMs: currentGameTimeMs,
      message: `Sold ${vehicle.name} for $${vehicle.resaleValue.toLocaleString()}.`,
      type: 'info' as const,
    }

    set({
      gameState: {
        ...gameState,
        cash:   gameState.cash + vehicle.resaleValue,
        fleet:  gameState.fleet.filter(v => v.id !== vehicleId),
        events: [...gameState.events, newEvent].slice(-50),
      },
    })
  },

  payDownHeat: () => {
    const { gameState } = get()
    const { cost, heatReduction, cooldownWeeks } = CONFIG.layLow
    if (gameState.cash < cost) return
    if (gameState.globalHeat <= 0) return
    if (gameState.turn - (gameState.lastLayLowTurn ?? 0) < cooldownWeeks) return

    const newHeat = Math.max(0, gameState.globalHeat - heatReduction)
    const newEvent = {
      id: `e_laylow_${currentGameTimeMs}`,
      gameTimeMs: currentGameTimeMs,
      message: `Laying low — heat reduced by ${gameState.globalHeat - newHeat}. -$${cost.toLocaleString()}`,
      type: 'info' as const,
    }

    set({
      gameState: {
        ...gameState,
        cash: gameState.cash - cost,
        globalHeat: newHeat,
        lastLayLowTurn: gameState.turn,
        events: [...gameState.events, newEvent].slice(-50),
      },
    })
  },

  unlockSkill: (skillId) => {
    const { gameState } = get()
    const skill = SKILL_BY_ID.get(skillId)
    if (!skill) return
    if (gameState.unlockedSkills.includes(skillId)) return

    const repRequired = CONFIG.skills.tierRepRequirements[`tier${skill.tier}` as 'tier1' | 'tier2' | 'tier3']
    if (gameState.reputation < repRequired) return

    if (skill.tier > 1) {
      const prereqId = `${skill.branch}_${skill.tier - 1}`
      if (!gameState.unlockedSkills.includes(prereqId)) return
    }

    const cost = CONFIG.skills.tierCashCosts[`tier${skill.tier}` as 'tier1' | 'tier2' | 'tier3']
    if (gameState.cash < cost) return

    const newEvent = {
      id: `e_skill_${skillId}_${currentGameTimeMs}`,
      gameTimeMs: currentGameTimeMs,
      message: `Skill unlocked: ${skill.name}`,
      type: 'success' as const,
    }

    // network_2 (Street Intel): reveal Inspector and Interpol on map
    const revealsThreats = skillId === 'network_2'

    set({
      gameState: {
        ...gameState,
        cash: gameState.cash - cost,
        unlockedSkills: [...gameState.unlockedSkills, skillId],
        inspector: revealsThreats
          ? { ...gameState.inspector, isTrackedByInformant: true }
          : gameState.inspector,
        interpol: revealsThreats
          ? { ...gameState.interpol, isTrackedByInformant: true }
          : gameState.interpol,
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
}))
