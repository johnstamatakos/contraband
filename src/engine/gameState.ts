// ─── Core ID types ───────────────────────────────────────────────────────────

export type CityId = string
export type RouteId = string
export type VehicleId = string
export type ContractId = string
export type ShipmentId = string
export type ContactId = string
export type WeatherEventId = string

// ─── Enumerations ────────────────────────────────────────────────────────────

export type VehicleType = 'truck' | 'plane' | 'ship'
export type RouteTier = 'domestic' | 'regional' | 'international' | 'long_haul'
export type RouteStatus = 'open' | 'pending' | 'closed'
export type RiskLevel = 'LOW' | 'MED' | 'HIGH'
export type ContactType =
  | 'customs_insider'
  | 'port_fixer'
  | 'informant'
  | 'fence'
  | 'underworld_broker'
  | 'freight_broker'
  | 'port_agent'
  | 'airline_partner'
export type WeatherType =
  | 'thunderstorm'
  | 'hurricane'
  | 'typhoon'
  | 'port_fog'
  | 'blizzard'
  | 'monsoon'
export type GamePhase = 'player_actions' | 'resolving' | 'game_over'
export type WinState = 'win_networth' | 'win_reputation' | 'lose_bankrupt' | 'lose_reputation'

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
}

export type VehicleSpec = Omit<Vehicle, 'id' | 'name' | 'isAssigned' | 'currentShipmentId' | 'type'>

export const VEHICLE_SPECS: Record<VehicleType, VehicleSpec> = {
  truck: {
    purchasePrice: 3000,
    maintenancePerTurn: 75,    // ~1 domestic contract covers 8+ weeks of upkeep
    capacity: 20,
    speedMin: 1,
    speedMax: 3,
    resaleValue: 1800,
  },
  plane: {
    purchasePrice: 12000,
    maintenancePerTurn: 400,   // 1 solid international run comfortably covers this
    capacity: 50,
    speedMin: 1,
    speedMax: 3,
    resaleValue: 7200,
  },
  ship: {
    purchasePrice: 8000,
    maintenancePerTurn: 175,   // slow but very low operating cost
    capacity: 150,
    speedMin: 3,
    speedMax: 10,
    resaleValue: 4800,
  },
}

export interface Route {
  id: RouteId
  origin: CityId
  destination: CityId
  tier: RouteTier
  status: RouteStatus
  heat: number // 0–5
  illicitLayerActive: boolean
  illicitLayerPending: boolean
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

export const ROUTE_COSTS: Record<RouteTier, { establish: number; illicit: number }> = {
  domestic: { establish: 500, illicit: 300 },
  regional: { establish: 1200, illicit: 600 },
  international: { establish: 2500, illicit: 1200 },
  long_haul: { establish: 4000, illicit: 2000 },
}

export interface Contract {
  id: ContractId
  origin: CityId
  destination: CityId
  cargoType: string
  volume: number
  payout: number
  deadline: number // turns remaining to complete
  repReward: number | null // null for legit
  riskLevel: RiskLevel
  isIllicit: boolean
  isAssigned: boolean
  assignedVehicleId: VehicleId | null
  expiresOnTurn: number
}

export interface ShipmentInTransit {
  id: ShipmentId
  contractId: ContractId
  vehicleId: VehicleId
  routeId: RouteId
  turnsRemaining: number  // display only; delivery triggered by departureTimeMs
  totalTurns: number
  isIllicit: boolean
  isFrozen: boolean       // weather freeze
  departureTimeMs: number // real-time ms when assigned; drives Pixi progress
  frozenDurationMs: number // accumulated ms of weather delay (extends arrival)
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

export interface Contact {
  id: ContactId
  type: ContactType
  cityId: CityId
  costPerTurn: number
  isHired: boolean
  isAvailable: boolean // false if burned after bust
}

export const CONTACT_COSTS: Record<ContactType, number> = {
  customs_insider: 800,
  port_fixer: 700,
  informant: 600,
  fence: 500,
  underworld_broker: 900,
  freight_broker: 300,
  port_agent: 500,
  airline_partner: 400,
}

export interface Investigator {
  currentCityId: CityId | null
  appearsOnTurn: number
  probableNextCityId: CityId | null
  isTrackedByInformant: boolean
}

// ─── Live event feed (replaces TurnLogEntry / turnLog) ────────────────────────

export interface LiveEvent {
  id: string
  gameTimeMs: number  // in-game time when event occurred
  message: string
  type: 'info' | 'warning' | 'danger' | 'success'
}

// ─── Weekly summary (shown in WeeklyReport modal) ────────────────────────────

export interface DeliveryRecord {
  origin: string        // city display name
  destination: string   // city display name
  payout: number
  isIllicit: boolean
  cargoType: string
  wasBust: boolean
}

export interface WeeklySummary {
  weekNumber: number
  fixedCosts: number        // cash spent on maintenance + contacts this week
  deliveryIncome: number    // cash earned from deliveries during the week
  netCashChange: number     // total cash delta (deliveries - fixed costs)
  repChange: number         // net rep delta
  heatChange: number        // net global heat delta
  contractsCompleted: number
  busts: number
  routesOpened: string[]    // e.g. "Chicago → New York"
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
  contacts: Contact[]
  investigator: Investigator
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
}

// ─── Derived values ────────────────────────────────────────────────────────────

export function getNetWorth(state: GameState): number {
  const fleetValue = state.fleet.reduce((sum, v) => sum + v.resaleValue, 0)
  return state.cash + fleetValue
}

export function getMaintenanceCost(state: GameState): number {
  return state.fleet.reduce((sum, v) => sum + v.maintenancePerTurn, 0)
}

export function getContactsCost(state: GameState): number {
  return state.contacts.filter(c => c.isHired).reduce((sum, c) => sum + c.costPerTurn, 0)
}

export function getFixedCosts(state: GameState): number {
  return getMaintenanceCost(state) + getContactsCost(state)
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
export const ROUTE_REP_REQUIREMENT: Record<RouteTier, number> = {
  domestic: 0,
  regional: 0,
  international: 60,
  long_haul: 75,
}

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
