import type { Contract, ContractLeg, GameState, Route, RouteTier, VehicleRequirements } from './gameState'
import { CONFIG } from './config'
import { findCommodityMatch } from '../data/commodities'

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

// ─── Config aliases ───────────────────────────────────────────────────────────

const ILLICIT_RISK: Record<RouteTier, 'LOW' | 'MED' | 'HIGH'> = {
  domestic:      'MED',
  regional:      'MED',
  international: 'HIGH',
  long_haul:     'HIGH',
}

const TIER_RANK: Record<RouteTier, number> = {
  domestic: 0, regional: 1, international: 2, long_haul: 3,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

let contractSeq = 1

// ─── Vehicle requirements by tier ────────────────────────────────────────────

function getVehicleRequirements(tier: RouteTier, isIllicit: boolean): VehicleRequirements {
  const reqs: VehicleRequirements = {}
  if (tier === 'international') {
    reqs.range = 1
    if (isIllicit) reqs.concealment = 1
  }
  if (tier === 'long_haul') {
    reqs.range = 2
    if (isIllicit) reqs.concealment = 1
  }
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
  isIllicit: boolean,
  turn: number,
  volumeMultiplier = 1,
  vehicleCapCeil = Infinity,
  vehicleRequirements: VehicleRequirements = {},
  requiredSkills: string[] = [],
): Contract {
  const { min, max } = CONFIG.contracts.volumeRange[tier]
  const volume = Math.min(Math.round(rand(min, max) * volumeMultiplier), vehicleCapCeil)
  const unitPay = isIllicit
    ? CONFIG.contracts.payoutPerUnit[tier].illicit
    : CONFIG.contracts.payoutPerUnit[tier].legit
  const deadline = rand(CONFIG.contracts.deadlineMin, CONFIG.contracts.deadlineMax)

  const matched = findCommodityMatch(origin, destination, isIllicit)
  const cargoType = matched ?? (isIllicit ? pick(ILLICIT_CARGO) : pick(LEGIT_CARGO))
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
    repReward: isIllicit ? CONFIG.contracts.illicitRepReward[tier] : null,
    riskLevel: isIllicit ? ILLICIT_RISK[tier] : 'LOW',
    isIllicit,
    isAssigned: false,
    assignedVehicleId: null,
    expiresOnTurn: turn + deadline,
    isRecurring: false,
    totalRuns: 1,
    runsCompleted: 0,
    legs: [{ origin, destination, assignedVehicleIds: [], shipmentIds: [], completedAt: null }],
    requiredVehicleCount: 1,
    vehicleRequirements,
    requiredSkills,
  }
}

// ─── Append a new leg to an existing contract ─────────────────────────────────

function upgradeToMultiLeg(contract: Contract, nextRoute: Route, payoutMultiplier: number): Contract {
  const higherTier: RouteTier =
    TIER_RANK[nextRoute.tier] > TIER_RANK[contract.tier] ? nextRoute.tier : contract.tier

  const reqs2 = getVehicleRequirements(nextRoute.tier, contract.isIllicit)
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
    repReward: contract.isIllicit ? CONFIG.contracts.illicitRepReward[higherTier] : null,
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
  isIllicit: boolean,
  turn: number,
  boardCount: Map<string, number>,
  cityBoardCount: Map<string, number>,
  allOpenRoutes: Route[],
  recentIllicitCompletions: string[],
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

  const perRouteMax = isIllicit
    ? CONFIG.contracts.illicitMaxPerRoute
    : CONFIG.contracts.maxPerRoute

  for (let i = 0; i < count; i++) {
    const available = eligibleRoutes.filter(r => {
      if (routeTotal(r) >= perRouteMax) return false
      if (cityTotal(r.origin) >= CONFIG.contracts.maxPerCity) return false
      if (cityTotal(r.destination) >= CONFIG.contracts.maxPerCity) return false
      // Illicit cooldown: skip routes with recent completions
      if (isIllicit && recentIllicitCompletions.includes(r.id)) return false
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

    const vehicleReqs = getVehicleRequirements(route.tier, isIllicit)
    let contract = makeContract(
      route.origin, route.destination, route.tier, isIllicit, turn,
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

        // Try extending to 3-leg
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

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateContracts(state: GameState): Contract[] {
  const { turn, reputation, routes, contracts, unlockedSkills } = state

  const openRoutes = routes.filter(r => r.status === 'open')
  const illicitRoutes = openRoutes.filter(r => r.illicitLayerActive)

  if (openRoutes.length === 0) return []

  // Tally ALL contracts (assigned + unassigned) per route pair and city.
  // This ensures routes with active recurring contracts get fewer new ones.
  const legitBoard = new Map<string, number>()
  const illicitBoard = new Map<string, number>()
  const legitCityBoard = new Map<string, number>()
  const illicitCityBoard = new Map<string, number>()
  let currentUnassignedLegit = 0
  let currentUnassigned = 0

  for (const c of contracts) {
    if (!c.isAssigned) currentUnassigned++
    const key = `${c.origin}_${c.destination}`
    if (c.isIllicit) {
      illicitBoard.set(key, (illicitBoard.get(key) ?? 0) + 1)
      illicitCityBoard.set(c.origin, (illicitCityBoard.get(c.origin) ?? 0) + 1)
      illicitCityBoard.set(c.destination, (illicitCityBoard.get(c.destination) ?? 0) + 1)
    } else {
      if (!c.isAssigned) currentUnassignedLegit++
      legitBoard.set(key, (legitBoard.get(key) ?? 0) + 1)
      legitCityBoard.set(c.origin, (legitCityBoard.get(c.origin) ?? 0) + 1)
      legitCityBoard.set(c.destination, (legitCityBoard.get(c.destination) ?? 0) + 1)
    }
  }

  const toGenerate = Math.max(0, CONFIG.contracts.boardSize - currentUnassigned)
  if (toGenerate === 0) return []

  // network_1: Black Market Access — extra illicit contract slots (+2)
  const illicitBonus = unlockedSkills.includes('network_1')
    ? CONFIG.skills.effects.network_1.illicitContractBonus
    : 0
  const targetIllicit = illicitRoutes.length > 0
    ? (turn <= 5 ? rand(1, 2) : turn <= 12 ? rand(2, 3) : rand(3, 4)) + illicitBonus
    : 0

  const illicitToGen = Math.max(0, Math.min(
    targetIllicit,
    toGenerate - Math.max(0, CONFIG.contracts.minLegit - currentUnassignedLegit),
  ))
  let legitToGen = toGenerate - illicitToGen

  const recentIllicit = state.recentIllicitCompletions ?? []

  // ── Tier-aware seeding: ensure at least 1 legit contract per active tier ────
  const tierRoutes = new Map<RouteTier, Route[]>()
  for (const r of openRoutes) {
    const arr = tierRoutes.get(r.tier) ?? []
    arr.push(r)
    tierRoutes.set(r.tier, arr)
  }

  const tierSeeded: Contract[] = []
  for (const [tier, tierRouteList] of tierRoutes) {
    const hasExisting = contracts.some(c => !c.isAssigned && !c.isIllicit && c.tier === tier)
    if (!hasExisting && tierRouteList.length > 0 && tierSeeded.length < legitToGen) {
      const route = pick(tierRouteList)
      const vehicleReqs = getVehicleRequirements(route.tier, false)
      tierSeeded.push(makeContract(
        route.origin, route.destination, route.tier, false, turn,
        1, maxCapForRoute(route), vehicleReqs,
      ))
    }
  }

  legitToGen -= tierSeeded.length

  const base: Contract[] = [
    ...tierSeeded,
    ...fillSlots(openRoutes, legitToGen, false, turn, legitBoard, legitCityBoard, openRoutes, []),
    ...fillSlots(illicitRoutes, illicitToGen, true, turn, illicitBoard, illicitCityBoard, openRoutes, recentIllicit),
  ]

  // ── Recurring upgrade for legit contracts ────────────────────────────────────
  const rc = CONFIG.contracts.recurring
  const generated: Contract[] = base.map(c => {
    if (c.isIllicit) return c
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

  // ── Skill-gated premium contracts ────────────────────────────────────────────
  if (
    unlockedSkills.includes('logistics_3') &&
    illicitRoutes.length > 0 &&
    generated.length < CONFIG.contracts.boardSize
  ) {
    const highRoutes = illicitRoutes.filter(r => r.tier === 'international' || r.tier === 'long_haul')
    if (highRoutes.length > 0) {
      const route = pick(highRoutes)
      const baseReqs = getVehicleRequirements(route.tier, true)
      const premiumReqs: VehicleRequirements = { ...baseReqs, cargo: 1 }
      const premium = makeContract(
        route.origin, route.destination, route.tier, true, turn,
        2.0, maxCapForRoute(route), premiumReqs, ['logistics_3'],
      )
      generated.push({
        ...premium,
        cargoType: 'Premium Contraband',
        payout: Math.round(premium.payout * 1.5),
        repReward: (CONFIG.contracts.illicitRepReward[route.tier] ?? 2) + 2,
      })
    }
  }

  if (
    unlockedSkills.includes('shadow_3') &&
    illicitRoutes.length > 0 &&
    generated.length < CONFIG.contracts.boardSize
  ) {
    const anyRoute = pick(illicitRoutes)
    const baseReqs = getVehicleRequirements(anyRoute.tier, true)
    const intelReqs: VehicleRequirements = { ...baseReqs, concealment: 2 }
    const intel = makeContract(
      anyRoute.origin, anyRoute.destination, anyRoute.tier, true, turn,
      1.5, maxCapForRoute(anyRoute), intelReqs, ['shadow_3'],
    )
    generated.push({
      ...intel,
      cargoType: 'Classified Materials',
      payout: Math.round(intel.payout * 1.8),
    })
  }

  // ── High-value bonus for experienced operators ───────────────────────────────
  const hv = CONFIG.contracts.highValueBonus
  if (
    turn >= hv.enabledFromTurn &&
    reputation >= hv.reputationRequired &&
    illicitRoutes.length > 0 &&
    generated.length < CONFIG.contracts.boardSize
  ) {
    const highTier = illicitRoutes.filter(r => r.tier === 'international' || r.tier === 'long_haul')
    if (highTier.length > 0) {
      const route = pick(highTier)
      const reqs = getVehicleRequirements(route.tier, true)
      generated.push(makeContract(
        route.origin, route.destination, route.tier, true, turn,
        hv.volumeMultiplier, maxCapForRoute(route), reqs,
      ))
    }
  }

  return generated
}
