import type { Route, RouteTier, VehicleType } from '../engine/gameState'

// travel days = game days (1 game day ≈ 17 real seconds at 2 min/week speed)
// plane: 1 day (< 4hr flight), 2 days (4–9hr), 3 days (10hr+ / very long haul)
// ship:  3–4 days (regional sea), 5–7 days (intercontinental), 10 days (very long haul)
// truck: 1 day (< 500mi / ~8hr drive), 2 days (500–1200mi), 3 days (1200mi+)

type RouteSpec = {
  origin: string
  destination: string
  tier: RouteTier
  open?: boolean
  allowedVehicles: VehicleType[]
  travelDays: Partial<Record<VehicleType, number>>
}

function makeRoute(spec: RouteSpec): Route {
  return {
    id: `route_${spec.origin}_${spec.destination}`,
    origin: spec.origin,
    destination: spec.destination,
    tier: spec.tier,
    status: spec.open ? 'open' : 'closed',
    heat: 0,
    illicitLayerActive: false,
    illicitLayerPending: false,
    turnsUntilOpen: null,
    openAtMs: null,
    allowedVehicles: spec.allowedVehicles,
    travelDays: spec.travelDays,
    flaggedTurnsRemaining: 0,
    lastIllicitRunTurn: null,
    consecutiveIllicitRuns: 0,
  }
}

// ─── Route definitions ────────────────────────────────────────────────────────
// Truck routes: overland, same continent, no ocean crossings
// Ship routes: both cities must have ports, sea/coastal connection
// Plane routes: all cities have airports (all routes)
//
// Note: trucks CAN'T cross oceans. Ships CAN'T dock at inland cities.
// Frankfurt, Chicago, Toronto, Mexico City, Bogotá, Nairobi, Madrid = no ship access

const ROUTE_SPECS: RouteSpec[] = [
  // ── Starting routes (pre-opened) ──────────────────────────────────────────
  { origin: 'chicago',     destination: 'new_york',    tier: 'domestic',      open: true,  allowedVehicles: ['truck', 'plane'], travelDays: { truck: 2, plane: 1 } },  // 790mi, ~12hr drive
  { origin: 'chicago',     destination: 'houston',     tier: 'domestic',      open: false, allowedVehicles: ['truck', 'plane'], travelDays: { truck: 2, plane: 1 } },  // 1090mi
  { origin: 'new_york',    destination: 'miami',       tier: 'domestic',      open: false, allowedVehicles: ['truck', 'plane'], travelDays: { truck: 2, plane: 1 } },  // 1280mi
  { origin: 'new_york',    destination: 'toronto',     tier: 'regional',      open: false, allowedVehicles: ['truck', 'plane'], travelDays: { truck: 1, plane: 1 } },  // 550mi, ~9hr

  // ── North America (overland — trucks eligible) ────────────────────────────
  { origin: 'chicago',     destination: 'los_angeles', tier: 'domestic',      open: false, allowedVehicles: ['truck', 'plane'], travelDays: { truck: 3, plane: 1 } },  // 2020mi, ~30hr
  { origin: 'houston',     destination: 'miami',       tier: 'domestic',      open: false, allowedVehicles: ['truck', 'plane'], travelDays: { truck: 2, plane: 1 } },  // 1190mi
  { origin: 'houston',     destination: 'new_york',    tier: 'domestic',      open: false, allowedVehicles: ['truck', 'plane'], travelDays: { truck: 2, plane: 1 } },  // 1630mi
  { origin: 'los_angeles', destination: 'mexico_city', tier: 'regional',      open: false, allowedVehicles: ['truck', 'plane'], travelDays: { truck: 3, plane: 1 } },  // 1550mi, ~24hr
  { origin: 'miami',       destination: 'houston',     tier: 'domestic',      open: false, allowedVehicles: ['truck', 'plane'], travelDays: { truck: 2, plane: 1 } },

  // ── North America to South America / Caribbean (ocean — no trucks) ────────
  { origin: 'miami',       destination: 'bogota',      tier: 'regional',      open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 3, plane: 2 } },  // 3.5hr flight
  { origin: 'miami',       destination: 'sao_paulo',   tier: 'international', open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 5, plane: 2 } },  // 9hr flight
  { origin: 'new_york',    destination: 'sao_paulo',   tier: 'international', open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 6, plane: 2 } },  // 10hr flight

  // ── Transatlantic (ocean — no trucks) ─────────────────────────────────────
  { origin: 'new_york',    destination: 'london',      tier: 'international', open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 7, plane: 2 } },  // 7hr flight
  { origin: 'new_york',    destination: 'rotterdam',   tier: 'long_haul',     open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 7, plane: 3 } },  // 8hr flight, very long haul
  { origin: 'miami',       destination: 'london',      tier: 'international', open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 7, plane: 2 } },

  // ── Europe (overland — trucks eligible where no ocean) ────────────────────
  { origin: 'london',      destination: 'rotterdam',   tier: 'regional',      open: false, allowedVehicles: ['truck', 'ship', 'plane'], travelDays: { truck: 1, ship: 2, plane: 1 } },  // 220mi via tunnel+ferry, 4hr drive
  { origin: 'london',      destination: 'frankfurt',   tier: 'regional',      open: false, allowedVehicles: ['truck', 'plane'],         travelDays: { truck: 2, plane: 1 } },  // 650mi via ferry, 2hr flight
  { origin: 'london',      destination: 'madrid',      tier: 'regional',      open: false, allowedVehicles: ['truck', 'plane'],         travelDays: { truck: 3, plane: 2 } },  // 1000mi via ferry, 2.5hr flight
  { origin: 'rotterdam',   destination: 'frankfurt',   tier: 'regional',      open: false, allowedVehicles: ['truck', 'plane'],         travelDays: { truck: 1, plane: 1 } },  // 250mi, 3hr drive

  // ── Europe to Middle East / Africa (plane only for inland, ship+plane for coastal) ─
  { origin: 'frankfurt',   destination: 'dubai',       tier: 'international', open: false, allowedVehicles: ['plane'],        travelDays: { plane: 2 } },           // 6hr flight
  { origin: 'london',      destination: 'dubai',       tier: 'international', open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 7, plane: 2 } }, // 7hr flight
  { origin: 'rotterdam',   destination: 'dubai',       tier: 'international', open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 7, plane: 2 } },
  { origin: 'dubai',       destination: 'nairobi',     tier: 'regional',      open: false, allowedVehicles: ['plane'],        travelDays: { plane: 2 } },           // 4hr flight
  { origin: 'dubai',       destination: 'mumbai',      tier: 'regional',      open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 3, plane: 1 } }, // 3hr flight

  // ── Long haul ocean ───────────────────────────────────────────────────────
  { origin: 'rotterdam',   destination: 'shanghai',    tier: 'long_haul',     open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 10, plane: 3 } }, // 12hr flight, 30-day sea
  { origin: 'los_angeles', destination: 'tokyo',       tier: 'long_haul',     open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 7, plane: 3 } },  // 11hr flight
  { origin: 'los_angeles', destination: 'singapore',   tier: 'long_haul',     open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 10, plane: 3 } }, // 17hr flight
  { origin: 'new_york',    destination: 'rotterdam',   tier: 'long_haul',     open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 7, plane: 3 } },

  // ── Asia (coastal/ocean — ships and planes) ───────────────────────────────
  { origin: 'mumbai',      destination: 'singapore',   tier: 'international', open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 5, plane: 2 } }, // 6hr flight
  { origin: 'singapore',   destination: 'bangkok',     tier: 'regional',      open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 3, plane: 1 } }, // 2hr flight
  { origin: 'singapore',   destination: 'hong_kong',   tier: 'regional',      open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 4, plane: 2 } }, // 3.5hr flight
  { origin: 'singapore',   destination: 'shanghai',    tier: 'international', open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 4, plane: 2 } }, // 5hr flight
  { origin: 'hong_kong',   destination: 'shanghai',    tier: 'regional',      open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 3, plane: 1 } }, // 2hr flight
  { origin: 'hong_kong',   destination: 'tokyo',       tier: 'regional',      open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 4, plane: 2 } }, // 4hr flight
  { origin: 'shanghai',    destination: 'tokyo',       tier: 'regional',      open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 3, plane: 1 } }, // 3hr flight
  { origin: 'dubai',       destination: 'singapore',   tier: 'international', open: false, allowedVehicles: ['ship', 'plane'], travelDays: { ship: 7, plane: 2 } }, // 7hr flight
]

export function getAllRoutes(): Route[] {
  return ROUTE_SPECS.map(makeRoute)
}

export const STARTING_ROUTE_IDS = new Set(
  ROUTE_SPECS.filter(s => s.open).map(s => `route_${s.origin}_${s.destination}`)
)
