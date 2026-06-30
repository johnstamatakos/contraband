import type { Contract, GameState, Route, RouteTier } from './gameState'
import { CITY_MAP } from '../data/cities'

// ─── Cargo pools ──────────────────────────────────────────────────────────────

const LEGIT_CARGO: readonly string[] = [
  'Electronics', 'Auto Parts', 'Pharmaceuticals', 'Food Commodities',
  'Textiles', 'Machinery', 'Medical Supplies', 'Industrial Equipment',
  'Consumer Goods', 'Raw Materials', 'Agricultural Products', 'Chemicals',
]

const ILLICIT_CARGO: readonly string[] = [
  'Counterfeit Electronics', 'Black Market Pharmaceuticals',
  'Smuggled Currency', 'Stolen Goods', 'Contraband Chemicals',
  'Forged Documents', 'Unlicensed Components', 'Restricted Tech',
]

// ─── Payout and volume tables ─────────────────────────────────────────────────

const PAYOUT_PER_UNIT: Record<RouteTier, { legit: number; illicit: number }> = {
  domestic:      { legit: 60,  illicit: 160 },
  regional:      { legit: 85,  illicit: 210 },
  international: { legit: 110, illicit: 270 },
  long_haul:     { legit: 165, illicit: 400 },
}

const VOLUME_RANGE: Record<RouteTier, { min: number; max: number }> = {
  domestic:      { min: 5,  max: 18 },
  regional:      { min: 8,  max: 32 },
  international: { min: 15, max: 45 },
  long_haul:     { min: 40, max: 120 },
}

const ILLICIT_RISK: Record<RouteTier, 'LOW' | 'MED' | 'HIGH'> = {
  domestic:      'MED',
  regional:      'MED',
  international: 'HIGH',
  long_haul:     'HIGH',
}

const ILLICIT_REP: Record<RouteTier, number> = {
  domestic:      2,
  regional:      3,
  international: 4,
  long_haul:     6,
}

const TARGET_BOARD_SIZE = 8
const MIN_LEGIT = 3
// Max contracts per route pair on the board at once.
const MAX_PER_ROUTE = 2
// Max contracts that involve the same city (as origin or destination) on the board at once.
// Prevents Chicago from appearing in every contract even when it has many routes.
const MAX_PER_CITY = 3

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

let contractSeq = 1

// ─── Weighted route selection ─────────────────────────────────────────────────

const TIER_WEIGHT: Record<'major_hub' | 'regional' | 'minor', number> = {
  major_hub: 3,
  regional:  2,
  minor:     1,
}

function routeWeight(r: Route): number {
  const o = CITY_MAP.get(r.origin)
  const d = CITY_MAP.get(r.destination)
  return Math.max(
    o ? TIER_WEIGHT[o.tier] : 1,
    d ? TIER_WEIGHT[d.tier] : 1,
  )
}

function pickWeighted(routes: Route[]): Route {
  const total = routes.reduce((s, r) => s + routeWeight(r), 0)
  let rng = Math.random() * total
  for (const r of routes) {
    rng -= routeWeight(r)
    if (rng <= 0) return r
  }
  return routes[routes.length - 1]!
}

// ─── Contract factory ─────────────────────────────────────────────────────────

function makeContract(
  origin: string,
  destination: string,
  tier: RouteTier,
  isIllicit: boolean,
  turn: number,
  volumeMultiplier = 1,
): Contract {
  const { min, max } = VOLUME_RANGE[tier]
  const volume = Math.round(rand(min, max) * volumeMultiplier)
  const unitPay = isIllicit ? PAYOUT_PER_UNIT[tier].illicit : PAYOUT_PER_UNIT[tier].legit
  const payout = volume * unitPay
  const deadline = rand(3, 5)

  return {
    id: `c_${turn}_${contractSeq++}_${Math.random().toString(36).slice(2, 5)}`,
    origin,
    destination,
    cargoType: isIllicit ? pick(ILLICIT_CARGO) : pick(LEGIT_CARGO),
    volume,
    payout,
    deadline,
    repReward: isIllicit ? ILLICIT_REP[tier] : null,
    riskLevel: isIllicit ? ILLICIT_RISK[tier] : 'LOW',
    isIllicit,
    isAssigned: false,
    assignedVehicleId: null,
    expiresOnTurn: turn + deadline,
  }
}

// ─── Diversity-aware slot filler ──────────────────────────────────────────────
//
// Fills `count` contract slots from `eligibleRoutes`.
// Always picks from routes with the fewest existing contracts first
// (coverage guarantee built-in). Stops adding to a route once it hits
// MAX_PER_ROUTE (existing board + this batch combined).

function fillSlots(
  eligibleRoutes: Route[],
  count: number,
  isIllicit: boolean,
  turn: number,
  boardCount: Map<string, number>,   // existing unassigned count per route key
  cityBoardCount: Map<string, number>, // existing unassigned count per city
): Contract[] {
  const result: Contract[] = []
  const batchCount = new Map<string, number>()
  const cityBatchCount = new Map<string, number>()

  const routeTotal = (r: Route): number => {
    const key = `${r.origin}_${r.destination}`
    return (boardCount.get(key) ?? 0) + (batchCount.get(key) ?? 0)
  }
  const cityTotal = (city: string): number =>
    (cityBoardCount.get(city) ?? 0) + (cityBatchCount.get(city) ?? 0)

  for (let i = 0; i < count; i++) {
    // Filter by both per-route cap and per-city cap
    const available = eligibleRoutes.filter(r =>
      routeTotal(r) < MAX_PER_ROUTE &&
      cityTotal(r.origin) < MAX_PER_CITY &&
      cityTotal(r.destination) < MAX_PER_CITY,
    )
    if (available.length === 0) break

    // Among available, prefer routes with the fewest contracts (diversity guarantee)
    const minSlots = Math.min(...available.map(r => routeTotal(r)))
    const priority = available.filter(r => routeTotal(r) === minSlots)

    // Flat random selection within the priority tier — no city-tier weighting
    // (weighted selection was causing Chicago to dominate even among equal-slot routes)
    const route = pick(priority)
    const routeKey = `${route.origin}_${route.destination}`
    batchCount.set(routeKey, (batchCount.get(routeKey) ?? 0) + 1)
    cityBatchCount.set(route.origin, (cityBatchCount.get(route.origin) ?? 0) + 1)
    cityBatchCount.set(route.destination, (cityBatchCount.get(route.destination) ?? 0) + 1)
    result.push(makeContract(route.origin, route.destination, route.tier, isIllicit, turn))
  }

  return result
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateContracts(state: GameState): Contract[] {
  const { turn, reputation, routes, contracts } = state

  const openRoutes = routes.filter(r => r.status === 'open')
  const illicitRoutes = openRoutes.filter(r => r.illicitLayerActive)

  if (openRoutes.length === 0) return []

  // Tally existing unassigned contracts per route pair and per city, split by type
  const legitBoard = new Map<string, number>()
  const illicitBoard = new Map<string, number>()
  const legitCityBoard = new Map<string, number>()
  const illicitCityBoard = new Map<string, number>()
  let currentUnassignedLegit = 0
  let currentUnassigned = 0

  for (const c of contracts) {
    if (c.isAssigned) continue
    currentUnassigned++
    const key = `${c.origin}_${c.destination}`
    if (c.isIllicit) {
      illicitBoard.set(key, (illicitBoard.get(key) ?? 0) + 1)
      illicitCityBoard.set(c.origin, (illicitCityBoard.get(c.origin) ?? 0) + 1)
      illicitCityBoard.set(c.destination, (illicitCityBoard.get(c.destination) ?? 0) + 1)
    } else {
      currentUnassignedLegit++
      legitBoard.set(key, (legitBoard.get(key) ?? 0) + 1)
      legitCityBoard.set(c.origin, (legitCityBoard.get(c.origin) ?? 0) + 1)
      legitCityBoard.set(c.destination, (legitCityBoard.get(c.destination) ?? 0) + 1)
    }
  }

  const toGenerate = Math.max(0, TARGET_BOARD_SIZE - currentUnassigned)
  if (toGenerate === 0) return []

  // Phase-based illicit target
  const targetIllicit = illicitRoutes.length > 0
    ? (turn <= 5 ? rand(1, 2) : turn <= 12 ? rand(2, 3) : rand(3, 4))
    : 0

  // Enforce legit floor
  const illicitToGen = Math.max(0, Math.min(
    targetIllicit,
    toGenerate - Math.max(0, MIN_LEGIT - currentUnassignedLegit),
  ))
  const legitToGen = toGenerate - illicitToGen

  const generated: Contract[] = [
    ...fillSlots(openRoutes, legitToGen, false, turn, legitBoard, legitCityBoard),
    ...fillSlots(illicitRoutes, illicitToGen, true, turn, illicitBoard, illicitCityBoard),
  ]

  // High-value bonus for experienced operators
  if (turn >= 13 && reputation >= 60 && illicitRoutes.length > 0 && generated.length < TARGET_BOARD_SIZE) {
    const highTier = illicitRoutes.filter(r => r.tier === 'international' || r.tier === 'long_haul')
    if (highTier.length > 0) {
      const route = pick(highTier)
      generated.push(makeContract(route.origin, route.destination, route.tier, true, turn, 2))
    }
  }

  return generated
}
