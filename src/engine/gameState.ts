import { CONFIG } from './config'

// ─── Core ID types ───────────────────────────────────────────────────────────

export type CityId = string
export type RouteId = string
export type VehicleId = string
export type ContractId = string
export type ShipmentId = string
export type WeatherEventId = string
export type SmuggleRunId = string

// ─── Enumerations ────────────────────────────────────────────────────────────

export type VehicleType = 'truck' | 'plane' | 'ship'
export type RouteTier = 'domestic' | 'regional' | 'international' | 'long_haul'
export type RouteStatus = 'open' | 'pending' | 'closed'
export type RiskLevel = 'LOW' | 'MED' | 'HIGH'
export type WeatherType =
  | 'thunderstorm'
  | 'hurricane'
  | 'typhoon'
  | 'port_fog'
  | 'blizzard'
  | 'monsoon'
export type GamePhase = 'player_actions' | 'resolving' | 'game_over'
export type WinState = 'win_reputation' | 'lose_bankrupt' | 'lose_reputation'

// ─── Core entities ────────────────────────────────────────────────────────────

export interface City {
  id: CityId
  name: string
  lat: number
  lon: number
  tier: 'major_hub' | 'regional' | 'minor'
  hasAirport: boolean   // planes can land
  hasPort: boolean      // ships can dock (coastal/ocean access)
  // Canvas coords added at runtime by projection layer
  x?: number
  y?: number
}

export type UpgradeType = 'cargo' | 'engine' | 'concealment' | 'range'

export interface VehicleUpgrades {
  cargo: 0 | 1 | 2
  engine: 0 | 1 | 2
  concealment: 0 | 1 | 2
  range: 0 | 1 | 2
}

export const DEFAULT_UPGRADES: VehicleUpgrades = { cargo: 0, engine: 0, concealment: 0, range: 0 }

export interface Vehicle {
  id: VehicleId
  type: VehicleType
  name: string
  purchasePrice: number
  maintenancePerTurn: number
  capacity: number
  // Turns per route leg: trucks 1-2, planes 1, ships 3-5
  speedMin: number
  speedMax: number
  resaleValue: number
  isAssigned: boolean
  currentShipmentId: ShipmentId | null
  upgrades: VehicleUpgrades
  isImpounded: boolean
  impoundFine: number | null          // cash required to recover the vehicle
  impoundExpiresOnTurn: number | null // turn on which the vehicle is permanently lost
}

export type VehicleSpec = Omit<Vehicle, 'id' | 'name' | 'isAssigned' | 'currentShipmentId' | 'type' | 'upgrades' | 'isImpounded' | 'impoundFine' | 'impoundExpiresOnTurn'>

export const VEHICLE_SPECS: Record<VehicleType, VehicleSpec> = CONFIG.vehicles

export interface Route {
  id: RouteId
  origin: CityId
  destination: CityId
  tier: RouteTier
  status: RouteStatus
  heat: number // 0–5
  turnsUntilOpen: number | null
  openAtMs: number | null  // real-time ms when pending route opens; null if not pending
  // Vehicle constraints
  allowedVehicles: VehicleType[]
  travelDays: Partial<Record<VehicleType, number>>  // turns to traverse this route by each vehicle
  // Whether route is in "flagged" state (post-bust)
  flaggedTurnsRemaining: number
  // Track consecutive illicit runs for detection modifier
  lastIllicitRunTurn: number | null
  consecutiveIllicitRuns: number
}

export const ROUTE_COSTS: Record<RouteTier, { establish: number }> = CONFIG.routes.costs

// A single leg in a multi-leg contract (or the only leg in a simple contract)
export interface ContractLeg {
  origin: CityId
  destination: CityId
  assignedVehicleIds: VehicleId[]  // empty = not yet assigned; convoy has multiple
  shipmentIds: ShipmentId[]        // active shipment IDs for this leg
  completedAt: number | null       // turn when this leg completed
}

// Upgrade requirements that vehicles must meet to take a contract
export type VehicleRequirements = Partial<Record<UpgradeType, 1 | 2>>

export interface Contract {
  id: ContractId
  origin: CityId        // display: first leg origin
  destination: CityId   // display: last leg destination
  cargoType: string
  volume: number
  payout: number
  deadline: number // turns remaining to complete
  repReward: number | null // null for legit
  riskLevel: RiskLevel
  tier: RouteTier
  isIllicit: boolean
  isAssigned: boolean     // true when all legs have all required vehicles assigned
  assignedVehicleId: VehicleId | null  // kept for recurring compat = legs[0].assignedVehicleIds[0]
  expiresOnTurn: number
  isRecurring: boolean    // true = multi-run supply contract (single-leg only)
  totalRuns: number       // total deliveries (1 for regular contracts)
  runsCompleted: number   // increments after each successful delivery
  // Complex contract fields
  legs: ContractLeg[]             // always present; single contracts have legs.length === 1
  requiredVehicleCount: number    // vehicles needed per leg (1 = normal, 2+ = convoy)
  vehicleRequirements: VehicleRequirements  // upgrade gates applied to all assigned vehicles
  requiredSkills: string[]        // skills player must have to assign this contract
}

export interface ShipmentInTransit {
  id: ShipmentId
  contractId: ContractId
  vehicleId: VehicleId
  routeId: RouteId
  legIndex: number        // which leg of the contract this shipment belongs to (0 for single-leg)
  turnsRemaining: number  // display only; delivery triggered by departureTimeMs
  totalTurns: number
  isIllicit: boolean
  isFrozen: boolean       // weather freeze
  departureTimeMs: number // real-time ms when assigned; drives Pixi progress
  frozenDurationMs: number // accumulated ms of weather delay (extends arrival)
  smuggleRunId: SmuggleRunId | null  // non-null when this shipment is part of a smuggling run
}

export interface WeatherEvent {
  id: WeatherEventId
  type: WeatherType
  affectedRouteIds: RouteId[]
  affectedCityIds: CityId[]
  turnsRemaining: number
  isForecast: boolean   // true = warning only; false = actively blocking
  clearAtMs: number | null  // real-time ms when the active storm expires
}

/** Shared shape for both threat entities. */
export interface ThreatEntity {
  currentCityId: CityId | null
  appearsOnTurn: number
  probableNextCityId: CityId | null
  isTrackedByInformant: boolean
  /** Interpol only: up to 2 extra simultaneous positions outside North America. */
  additionalCityIds: CityId[]
}
/** Domestic / regional threat — appears early, lighter penalties. */
export type Inspector = ThreatEntity
/** International / long-haul threat — appears mid-game, severe penalties. */
export type Interpol = ThreatEntity

// ─── Live event feed (replaces TurnLogEntry / turnLog) ────────────────────────

export interface LiveEvent {
  id: string
  gameTimeMs: number  // in-game time when event occurred
  message: string
  type: 'info' | 'warning' | 'danger' | 'success'
}

// ─── Weekly summary (shown in WeeklyReport modal) ────────────────────────────

/** Per-factor breakdown returned by detectionChanceWithBreakdown. */
export interface DetectionBreakdown {
  base: number
  routeHeat: number
  globalHeat: number
  consecutiveRuns: number
  threatBonus: number          // inspector/interpol bonus (after shadow_3 multiplier)
  skillsReduction: number      // shadow_1 flat reduction
  concealmentReduction: number // vehicle concealment upgrade
  legitCover: number           // plausible deniability from legit recurring shipments
  contactsReduction: number    // customs_insider on intl/long-haul
  vehiclePenalty: number       // smuggling: extra vehicles in convoy
  volumePenalty: number        // smuggling: large cargo volume
  final: number                // clamped total probability
}

export interface DeliveryRecord {
  origin: string        // city display name
  destination: string   // city display name
  payout: number
  isIllicit: boolean
  cargoType: string
  wasBust: boolean
  risk: number | null   // detection probability at time of delivery (null for legit / piracy)
  riskBreakdown: DetectionBreakdown | null
}

export interface WeeklySummary {
  weekNumber: number
  fixedCosts: number          // total cash spent on maintenance this week
  maintenanceCost: number     // fleet maintenance cost
  deliveryIncome: number      // cash earned from deliveries during the week
  netCashChange: number       // total cash delta (deliveries - fixed costs)
  repChange: number           // net rep delta
  heatChange: number          // net global heat delta
  contractsCompleted: number
  busts: number
  routesOpened: string[]      // e.g. "Chicago → New York"
  completedDeliveries: DeliveryRecord[]
}

// ─── Weekly stats accumulator (reset each week) ──────────────────────────────

export interface WeeklyStats {
  deliveryIncome: number
  contractsCompleted: number
  busts: number
  repFromDeliveries: number
  heatFromDeliveries: number
  deliveries: DeliveryRecord[]
}

// ─── Commodity smuggling ─────────────────────────────────────────────────────

export interface SmuggleRunHop {
  origin: CityId
  destination: CityId
  routeId: RouteId
  routeTier: RouteTier
  status: 'pending' | 'in_transit' | 'cleared' | 'busted'
  shipmentIds: ShipmentId[]
  departureTimeMs: number | null
}

export interface SmuggleRun {
  id: SmuggleRunId
  commodityKey: string            // key into CONFIG.smuggling.commodities
  volume: number                  // units being transported
  buyPricePerUnit: number         // purchase cost (already deducted)
  sellPricePerUnit: number        // revenue per unit at destination
  expectedPayout: number          // volume * sellPricePerUnit
  sourceCity: CityId              // city where commodity was purchased
  destinationCity: CityId         // final delivery city
  hops: SmuggleRunHop[]           // ordered route segments
  currentHopIndex: number         // which hop is active (0-based)
  vehicleIds: VehicleId[]         // all vehicles in the convoy
  repReward: number               // calculated on creation
  status: 'in_transit' | 'completed' | 'busted'
  createdAtTurn: number
  completedAtTurn: number | null
}

// ─── Lifetime stats (persisted across weeks, never reset) ───────────────────

export interface LifetimeStats {
  totalMoneyEarned: number        // all income (legit + smuggle payouts)
  totalMoneySpent: number         // all spending (vehicles, routes, commodities, upgrades, skills, fines, lay low)
  smuggleRunsCompleted: number
  smuggleRunsBusted: number
  legitDeliveriesCompleted: number
  timesBusted: number             // total busts (smuggle + legacy)
  timesSabotaged: number          // rival sabotage events
  largestFleetSize: number        // peak fleet count
  largestSmugglePayout: number    // biggest single smuggle run revenue
  largestContractPayout: number   // biggest single legit contract payout
  totalCommoditiesSmuggled: Record<string, number>  // commodity key -> total units delivered
  totalLegitCargoDelivered: number
  routesEstablished: number
  vehiclesPurchased: number
  vehiclesLost: number            // permanently seized or expired impounds
  skillsUnlocked: number
  closeCalls: number              // smuggle hops cleared with >= 30% risk
  peakReputation: number
  peakCash: number
}

export const DEFAULT_LIFETIME_STATS: LifetimeStats = {
  totalMoneyEarned: 0,
  totalMoneySpent: 0,
  smuggleRunsCompleted: 0,
  smuggleRunsBusted: 0,
  legitDeliveriesCompleted: 0,
  timesBusted: 0,
  timesSabotaged: 0,
  largestFleetSize: 2,
  largestSmugglePayout: 0,
  largestContractPayout: 0,
  totalCommoditiesSmuggled: {},
  totalLegitCargoDelivered: 0,
  routesEstablished: 0,
  vehiclesPurchased: 0,
  vehiclesLost: 0,
  skillsUnlocked: 0,
  closeCalls: 0,
  peakReputation: 10,
  peakCash: 15_000,
}

// ─── Root game state ──────────────────────────────────────────────────────────

export interface GameState {
  cash: number
  reputation: number      // 0–100
  globalHeat: number      // 0–100
  turn: number            // current week number
  fleet: Vehicle[]
  routes: Route[]
  contracts: Contract[]
  shipmentsInTransit: ShipmentInTransit[]
  weatherEvents: WeatherEvent[]
  inspector: Inspector
  interpol: Interpol
  events: LiveEvent[]           // live event feed, capped at 50
  phase: GamePhase
  winState: WinState | null
  // Track weeks since last illicit activity for rep decay
  turnsWithoutIllicitActivity: number
  // Pending route establishment (to be processed next turn)
  pendingRouteEstablishments: RouteId[]
  // Weekly report
  lastWeeklySummary: WeeklySummary | null
  // Stats accumulator for current week (reset by weeklyTick)
  weeklyStats: WeeklyStats
  // For clock reset on new game
  gameVersion: number
  // Skill tree: ids of unlocked skills (e.g. 'shadow_1', 'logistics_2')
  unlockedSkills: string[]
  // Set true after first illicit arrival (caught or cleared) — gates rep decay
  hasCompletedFirstIllicit: boolean
  // Rolling weekly net-cash history (most recent last); used for the P&L chart
  profitHistory: number[]
  // Turn when player last used "Lay Low" heat reduction
  lastLayLowTurn: number
  // Route IDs of recently completed illicit contracts (cleared per generation cycle)
  recentIllicitCompletions: string[]
  // ── Commodity smuggling ──
  // Per-city inventory of purchased illicit commodities
  cityInventory: Record<string, Record<string, number>>
  // Active smuggling runs
  smuggleRuns: SmuggleRun[]
  // Lifetime stats (never reset, tracks all-time records)
  lifetimeStats: LifetimeStats
}

// ─── Derived values ────────────────────────────────────────────────────────────

export function getNetWorth(state: GameState): number {
  const fleetValue = state.fleet.reduce((sum, v) => sum + v.resaleValue, 0)
  return state.cash + fleetValue
}

export function getMaintenanceCost(state: GameState): number {
  const base = state.fleet.reduce((sum, v) => sum + v.maintenancePerTurn, 0)
  // logistics_1: Fleet Efficiency — maintenance cost multiplier
  const multiplier = state.unlockedSkills.includes('logistics_1')
    ? CONFIG.skills.effects.logistics_1.maintenanceMultiplier
    : 1.0
  return Math.round(base * multiplier)
}

export function getFixedCosts(state: GameState): number {
  return getMaintenanceCost(state)
}

// ─── Route establishment helpers ───────────────────────────────────────────────

/** Cities reachable from your current network (any open or pending route endpoint). */
export function getNetworkCities(routes: Route[]): Set<string> {
  const cities = new Set<string>()
  for (const r of routes) {
    if (r.status === 'open' || r.status === 'pending') {
      cities.add(r.origin)
      cities.add(r.destination)
    }
  }
  return cities
}

/** Minimum reputation required to establish a route of this tier. */
export const ROUTE_REP_REQUIREMENT: Record<RouteTier, number> = CONFIG.routes.repRequirements

export function canEstablishRoute(
  route: Route,
  gameState: GameState,
): { ok: boolean; reason?: string } {
  if (route.status !== 'closed') {
    return { ok: false, reason: 'Route is not closed' }
  }

  const network = getNetworkCities(gameState.routes)
  if (!network.has(route.origin) && !network.has(route.destination)) {
    return { ok: false, reason: 'Expand your network to reach this route first' }
  }

  const repReq = ROUTE_REP_REQUIREMENT[route.tier]
  if (gameState.reputation < repReq) {
    return { ok: false, reason: `Requires Rep ${repReq}` }
  }

  return { ok: true }
}
