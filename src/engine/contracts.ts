import type { Contract, GameState, Route, RouteTier } from './gameState'
import { CITY_MAP } from '../data/cities'
import { CONFIG } from './config'

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

// ─── Config aliases (shorthand for readability) ───────────────────────────────

const ILLICIT_RISK: Record<RouteTier, 'LOW' | 'MED' | 'HIGH'> = {
  domestic:      'MED',
  regional:      'MED',
  international: 'HIGH',
  long_haul:     'HIGH',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

let contractSeq = 1

// ─── Contract factory ─────────────────────────────────────────────────────────

function makeContract(
  origin: string,
  destination: string,
  tier: RouteTier,
  isIllicit: boolean,
  turn: number,
  volumeMultiplier = 1,
): Contract {
  const { min, max } = CONFIG.contracts.volumeRange[tier]
  const volume = Math.round(rand(min, max) * volumeMultiplier)
  const unitPay = isIllicit
    ? CONFIG.contracts.payoutPerUnit[tier].illicit
    : CONFIG.contracts.payoutPerUnit[tier].legit
  const payout = volume * unitPay
  const deadline = rand(CONFIG.contracts.deadlineMin, CONFIG.contracts.deadlineMax)

  return {
    id: `c_${turn}_${contractSeq++}_${Math.random().toString(36).slice(2, 5)}`,
    origin,
    destination,
    tier,
    cargoType: isIllicit ? pick(ILLICIT_CARGO) : pick(LEGIT_CARGO),
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
  boardCount: Map<string, number>,
  cityBoardCount: Map<string, number>,
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
    const available = eligibleRoutes.filter(r =>
      routeTotal(r) < CONFIG.contracts.maxPerRoute &&
      cityTotal(r.origin) < CONFIG.contracts.maxPerCity &&
      cityTotal(r.destination) < CONFIG.contracts.maxPerCity,
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

  const toGenerate = Math.max(0, CONFIG.contracts.boardSize - currentUnassigned)
  if (toGenerate === 0) return []

  // Phase-based illicit target
  // network_1: Black Market Access — extra illicit contract slots
  const illicitBonus = state.unlockedSkills.includes('network_1')
    ? CONFIG.skills.effects.network_1.illicitContractBonus
    : 0
  const targetIllicit = illicitRoutes.length > 0
    ? (turn <= 5 ? rand(1, 2) : turn <= 12 ? rand(2, 3) : rand(3, 4)) + illicitBonus
    : 0

  // Enforce legit floor
  const illicitToGen = Math.max(0, Math.min(
    targetIllicit,
    toGenerate - Math.max(0, CONFIG.contracts.minLegit - currentUnassignedLegit),
  ))
  const legitToGen = toGenerate - illicitToGen

  const base: Contract[] = [
    ...fillSlots(openRoutes, legitToGen, false, turn, legitBoard, legitCityBoard),
    ...fillSlots(illicitRoutes, illicitToGen, true, turn, illicitBoard, illicitCityBoard),
  ]

  // Upgrade some contracts to recurring supply runs
  const rc = CONFIG.contracts.recurring
  const generated: Contract[] = base.map(c => {
    if (c.isIllicit) return c  // illicit contracts are never recurring
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
      deadline: runs * CONFIG.contracts.deadlineMax,
      expiresOnTurn: c.expiresOnTurn + (runs - 1) * CONFIG.contracts.deadlineMax,
    }
  })

  // High-value bonus for experienced operators
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
      generated.push(makeContract(route.origin, route.destination, route.tier, true, turn, hv.volumeMultiplier))
    }
  }

  return generated
}
