import type { Contract, ContractLeg, GameState, Route, RouteTier, VehicleRequirements } from './gameState'
import { CONFIG } from './config'
import { findCommodityMatch } from '../data/commodities'

// ─── Cargo pool ──────────────────────────────────────────────────────────────

const LEGIT_CARGO: readonly string[] = [
  'Electronics', 'Auto Parts', 'Pharmaceuticals', 'Food Commodities',
  'Textiles', 'Machinery', 'Medical Supplies', 'Industrial Equipment',
  'Consumer Goods', 'Raw Materials', 'Agricultural Products', 'Chemicals',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_RANK: Record<RouteTier, number> = {
  domestic: 0, regional: 1, international: 2, long_haul: 3,
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

let contractSeq = 1

// ─── Vehicle requirements by tier ────────────────────────────────────────────

function getVehicleRequirements(tier: RouteTier): VehicleRequirements {
  const reqs: VehicleRequirements = {}
  if (tier === 'international') reqs.range = 1
  if (tier === 'long_haul') reqs.range = 2
  return reqs
}

// ─── Contract factory ─────────────────────────────────────────────────────────

function maxCapForRoute(route: Route): number {
  return Math.max(...route.allowedVehicles.map(vt => CONFIG.vehicles[vt].capacity))
}

function makeContract(
  origin: string,
  destination: string,
  tier: RouteTier,
  turn: number,
  volumeMultiplier = 1,
  vehicleCapCeil = Infinity,
  vehicleRequirements: VehicleRequirements = {},
): Contract {
  const { min, max } = CONFIG.contracts.volumeRange[tier]
  const volume = Math.min(Math.round(rand(min, max) * volumeMultiplier), vehicleCapCeil)
  const unitPay = CONFIG.contracts.payoutPerUnit[tier].legit
  const deadline = rand(CONFIG.contracts.deadlineMin, CONFIG.contracts.deadlineMax)

  const matched = findCommodityMatch(origin, destination, false)
  const cargoType = matched ?? pick(LEGIT_CARGO)
  const payout = matched
    ? Math.round(volume * unitPay * CONFIG.contracts.commodityMatchBonus)
    : volume * unitPay

  return {
    id: `c_${turn}_${contractSeq++}_${Math.random().toString(36).slice(2, 5)}`,
    origin,
    destination,
    tier,
    cargoType,
    volume,
    payout,
    deadline,
    repReward: null,
    riskLevel: 'LOW',
    isIllicit: false,
    isAssigned: false,
    assignedVehicleId: null,
    expiresOnTurn: turn + deadline,
    isRecurring: false,
    totalRuns: 1,
    runsCompleted: 0,
    legs: [{ origin, destination, assignedVehicleIds: [], shipmentIds: [], completedAt: null }],
    requiredVehicleCount: 1,
    vehicleRequirements,
    requiredSkills: [],
  }
}

// ─── Append a new leg to an existing contract ─────────────────────────────────

function upgradeToMultiLeg(contract: Contract, nextRoute: Route, payoutMultiplier: number): Contract {
  const higherTier: RouteTier =
    TIER_RANK[nextRoute.tier] > TIER_RANK[contract.tier] ? nextRoute.tier : contract.tier

  const reqs2 = getVehicleRequirements(nextRoute.tier)
  const mergedReqs: VehicleRequirements = { ...contract.vehicleRequirements }
  for (const [k, v] of Object.entries(reqs2) as ['range' | 'concealment' | 'cargo' | 'engine', 1 | 2][]) {
    const cur = mergedReqs[k] ?? 0
    if (v > cur) mergedReqs[k] = v
  }

  const newLeg: ContractLeg = {
    origin: nextRoute.origin,
    destination: nextRoute.destination,
    assignedVehicleIds: [],
    shipmentIds: [],
    completedAt: null,
  }

  const ml = CONFIG.contracts.multiLeg
  const legCount = contract.legs.length + 1

  return {
    ...contract,
    destination: nextRoute.destination,
    tier: higherTier,
    payout: Math.round(contract.payout * payoutMultiplier),
    repReward: null,
    vehicleRequirements: mergedReqs,
    legs: [...contract.legs, newLeg],
    deadline: rand(
      CONFIG.contracts.deadlineMin + ml.extraDeadlineDays * (legCount - 1),
      CONFIG.contracts.deadlineMax + ml.extraDeadlineDays * (legCount - 1),
    ),
  }
}

// ─── Diversity-aware slot filler ──────────────────────────────────────────────

function fillSlots(
  eligibleRoutes: Route[],
  count: number,
  turn: number,
  boardCount: Map<string, number>,
  cityBoardCount: Map<string, number>,
  allOpenRoutes: Route[],
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
    const available = eligibleRoutes.filter(r => {
      if (routeTotal(r) >= CONFIG.contracts.maxPerRoute) return false
      if (cityTotal(r.origin) >= CONFIG.contracts.maxPerCity) return false
      if (cityTotal(r.destination) >= CONFIG.contracts.maxPerCity) return false
      return true
    })
    if (available.length === 0) break

    const minSlots = Math.min(...available.map(r => routeTotal(r)))
    const priority = available.filter(r => routeTotal(r) === minSlots)
    const route = pick(priority)
    const routeKey = `${route.origin}_${route.destination}`
    batchCount.set(routeKey, (batchCount.get(routeKey) ?? 0) + 1)
    cityBatchCount.set(route.origin, (cityBatchCount.get(route.origin) ?? 0) + 1)
    cityBatchCount.set(route.destination, (cityBatchCount.get(route.destination) ?? 0) + 1)

    const vehicleReqs = getVehicleRequirements(route.tier)
    let contract = makeContract(
      route.origin, route.destination, route.tier, turn,
      1, maxCapForRoute(route), vehicleReqs,
    )

    // ── Multi-leg upgrade (any tier, configurable chance) ──────────────────────
    const ml = CONFIG.contracts.multiLeg
    if (TIER_RANK[route.tier] >= ml.minTierRank && Math.random() < ml.twoLegChance) {
      const connectingRoutes = allOpenRoutes.filter(r =>
        r.origin === route.destination && r.id !== route.id,
      )
      if (connectingRoutes.length > 0) {
        const leg2Route = pick(connectingRoutes)
        contract = upgradeToMultiLeg(contract, leg2Route, ml.twoLegPayoutMult)

        if (Math.random() < ml.threeLegChance) {
          const leg3Routes = allOpenRoutes.filter(r =>
            r.origin === leg2Route.destination &&
            r.id !== leg2Route.id &&
            r.id !== route.id,
          )
          if (leg3Routes.length > 0) {
            contract = upgradeToMultiLeg(contract, pick(leg3Routes), ml.threeLegPayoutMult / ml.twoLegPayoutMult)
          }
        }
      }
    }

    result.push(contract)
  }

  return result
}

// ─── Main generator (legit contracts only) ───────────────────────────────────

export function generateContracts(state: GameState): Contract[] {
  const { turn, routes, contracts } = state

  const openRoutes = routes.filter(r => r.status === 'open')
  if (openRoutes.length === 0) return []

  // Tally ALL contracts (assigned + unassigned) per route pair and city.
  const boardCount = new Map<string, number>()
  const cityBoardCount = new Map<string, number>()
  let currentUnassigned = 0

  for (const c of contracts) {
    if (!c.isAssigned) currentUnassigned++
    const key = `${c.origin}_${c.destination}`
    boardCount.set(key, (boardCount.get(key) ?? 0) + 1)
    cityBoardCount.set(c.origin, (cityBoardCount.get(c.origin) ?? 0) + 1)
    cityBoardCount.set(c.destination, (cityBoardCount.get(c.destination) ?? 0) + 1)
  }

  let toGenerate = Math.max(0, CONFIG.contracts.boardSize - currentUnassigned)
  if (toGenerate === 0) return []

  // ── Tier-aware seeding: ensure at least 1 legit contract per active tier ────
  const tierRoutes = new Map<RouteTier, Route[]>()
  for (const r of openRoutes) {
    const arr = tierRoutes.get(r.tier) ?? []
    arr.push(r)
    tierRoutes.set(r.tier, arr)
  }

  const tierSeeded: Contract[] = []
  for (const [tier, tierRouteList] of tierRoutes) {
    const hasExisting = contracts.some(c => !c.isAssigned && c.tier === tier)
    if (!hasExisting && tierRouteList.length > 0 && tierSeeded.length < toGenerate) {
      const route = pick(tierRouteList)
      const vehicleReqs = getVehicleRequirements(route.tier)
      tierSeeded.push(makeContract(
        route.origin, route.destination, route.tier, turn,
        1, maxCapForRoute(route), vehicleReqs,
      ))
    }
  }

  toGenerate -= tierSeeded.length

  const base: Contract[] = [
    ...tierSeeded,
    ...fillSlots(openRoutes, toGenerate, turn, boardCount, cityBoardCount, openRoutes),
  ]

  // ── Recurring upgrade for legit contracts ────────────────────────────────────
  const rc = CONFIG.contracts.recurring
  const generated: Contract[] = base.map(c => {
    if (c.legs.length > 1) return c  // no recurring for multi-leg
    const spawnChance = rc.legitSpawnChance[c.tier as keyof typeof rc.legitSpawnChance]
    if (Math.random() > spawnChance) return c
    const { min, max } = rc.runs[c.tier as keyof typeof rc.runs]
    const runs = rand(min, max)
    return {
      ...c,
      isRecurring: true,
      totalRuns: runs,
      runsCompleted: 0,
      payout: Math.round(c.payout * rc.payoutMultiplier),
    }
  })

  return generated
}
