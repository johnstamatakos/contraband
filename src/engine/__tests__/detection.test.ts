import { describe, it, expect } from 'vitest'
import { detectionChanceWithBreakdown, smuggleHopDetection } from '../detection'
import { CONFIG } from '../config'
import type { Route } from '../gameState'

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route_a_b',
    origin: 'chicago',
    destination: 'new_york',
    tier: 'domestic',
    status: 'open',
    heat: 0,
    turnsUntilOpen: null,
    openAtMs: null,
    allowedVehicles: ['truck', 'plane'],
    travelDays: { truck: 2, plane: 1 },
    flaggedTurnsRemaining: 0,
    lastIllicitRunTurn: null,
    consecutiveIllicitRuns: 0,
    ...overrides,
  }
}

describe('detectionChanceWithBreakdown', () => {
  it('returns base chance with no modifiers', () => {
    const { prob, breakdown } = detectionChanceWithBreakdown({
      route: makeRoute(),
      allRoutes: [],
      globalHeat: 0,
      inspectorCityId: null,
      interpolCityId: null,
    })
    expect(breakdown.base).toBe(CONFIG.detection.baseChance)
    expect(prob).toBeCloseTo(CONFIG.detection.baseChance, 5)
  })

  it('adds route heat', () => {
    const route = makeRoute({ heat: 3 })
    const { breakdown } = detectionChanceWithBreakdown({
      route,
      allRoutes: [],
      globalHeat: 0,
      inspectorCityId: null,
      interpolCityId: null,
    })
    expect(breakdown.routeHeat).toBeCloseTo(3 * CONFIG.detection.perRouteHeat, 5)
  })

  it('adds global heat', () => {
    const { breakdown } = detectionChanceWithBreakdown({
      route: makeRoute(),
      allRoutes: [],
      globalHeat: 50,
      inspectorCityId: null,
      interpolCityId: null,
    })
    expect(breakdown.globalHeat).toBeCloseTo(50 * CONFIG.detection.perGlobalHeatPoint, 5)
  })

  it('adds consecutive run penalty capped at max', () => {
    const route = makeRoute({ consecutiveIllicitRuns: 10 }) // above max of 5
    const { breakdown } = detectionChanceWithBreakdown({
      route,
      allRoutes: [],
      globalHeat: 0,
      inspectorCityId: null,
      interpolCityId: null,
    })
    expect(breakdown.consecutiveRuns).toBeCloseTo(
      CONFIG.detection.maxConsecutiveRuns * CONFIG.detection.perConsecutiveRun, 5,
    )
  })

  it('adds inspector bonus when at route endpoint', () => {
    const { breakdown } = detectionChanceWithBreakdown({
      route: makeRoute(),
      allRoutes: [],
      globalHeat: 0,
      inspectorCityId: 'chicago', // at origin
      interpolCityId: null,
    })
    expect(breakdown.threatBonus).toBeCloseTo(CONFIG.detection.inspectorBonus, 5)
  })

  it('does not add inspector bonus on international routes', () => {
    const { breakdown } = detectionChanceWithBreakdown({
      route: makeRoute({ tier: 'international' }),
      allRoutes: [],
      globalHeat: 0,
      inspectorCityId: 'chicago',
      interpolCityId: null,
    })
    expect(breakdown.threatBonus).toBe(0)
  })

  it('adds interpol bonus on international route at endpoint', () => {
    const { breakdown } = detectionChanceWithBreakdown({
      route: makeRoute({ tier: 'international', origin: 'london', destination: 'dubai' }),
      allRoutes: [],
      globalHeat: 0,
      inspectorCityId: null,
      interpolCityId: 'london',
    })
    expect(breakdown.threatBonus).toBeCloseTo(CONFIG.detection.interpolBonus, 5)
  })

  it('reduces detection with shadow_1 skill', () => {
    const { breakdown } = detectionChanceWithBreakdown({
      route: makeRoute(),
      allRoutes: [],
      globalHeat: 0,
      inspectorCityId: null,
      interpolCityId: null,
      unlockedSkills: ['shadow_1'],
    })
    expect(breakdown.skillsReduction).toBe(CONFIG.skills.effects.shadow_1.detectionReduction)
  })

  it('reduces detection with concealment tier 2', () => {
    const { breakdown } = detectionChanceWithBreakdown({
      route: makeRoute(),
      allRoutes: [],
      globalHeat: 0,
      inspectorCityId: null,
      interpolCityId: null,
      concealmentTier: 2,
    })
    expect(breakdown.concealmentReduction).toBe(CONFIG.vehicleUpgrades.effects.concealment.tier2DetectionReduction)
  })

  it('clamps to minimum probability', () => {
    const { prob } = detectionChanceWithBreakdown({
      route: makeRoute(),
      allRoutes: [],
      globalHeat: 0,
      inspectorCityId: null,
      interpolCityId: null,
      unlockedSkills: ['shadow_1'],
      concealmentTier: 2,
      activeLegitRecurringCount: 10,
    })
    expect(prob).toBeGreaterThanOrEqual(CONFIG.detection.minProbability)
  })

  it('clamps to maximum probability', () => {
    const { prob } = detectionChanceWithBreakdown({
      route: makeRoute({ heat: 5, consecutiveIllicitRuns: 5 }),
      allRoutes: [],
      globalHeat: 100,
      inspectorCityId: 'chicago',
      interpolCityId: null,
    })
    expect(prob).toBeLessThanOrEqual(CONFIG.detection.maxProbability)
  })

  it('applies shadow_3 multiplier to threat bonus', () => {
    const without = detectionChanceWithBreakdown({
      route: makeRoute(),
      allRoutes: [],
      globalHeat: 0,
      inspectorCityId: 'chicago',
      interpolCityId: null,
    })
    const with3 = detectionChanceWithBreakdown({
      route: makeRoute(),
      allRoutes: [],
      globalHeat: 0,
      inspectorCityId: 'chicago',
      interpolCityId: null,
      unlockedSkills: ['shadow_3'],
    })
    expect(with3.breakdown.threatBonus).toBeLessThan(without.breakdown.threatBonus)
    expect(with3.breakdown.threatBonus).toBeCloseTo(
      CONFIG.detection.inspectorBonus * CONFIG.skills.effects.shadow_3.threatBonusMultiplier, 5,
    )
  })
})

describe('smuggleHopDetection', () => {
  it('adds vehicle penalty for convoys', () => {
    const { breakdown } = smuggleHopDetection({
      routeSegment: makeRoute(),
      allRoutes: [],
      globalHeat: 0,
      arrivalCityId: 'new_york',
      inspectorCityId: null,
      interpolCityId: null,
      interpolAdditionalIds: [],
      unlockedSkills: [],
      minConcealmentTier: 0,
      activeLegitRecurringCount: 0,
      vehicleCount: 3,
      volume: 10,
    })
    expect(breakdown.vehiclePenalty).toBeCloseTo(2 * CONFIG.smuggling.detection.perExtraVehicle, 5)
  })

  it('adds volume penalty above threshold', () => {
    const sd = CONFIG.smuggling.detection
    const volume = sd.volumeThreshold + sd.volumeStepSize * 2 // two steps above
    const { breakdown } = smuggleHopDetection({
      routeSegment: makeRoute(),
      allRoutes: [],
      globalHeat: 0,
      arrivalCityId: 'new_york',
      inspectorCityId: null,
      interpolCityId: null,
      interpolAdditionalIds: [],
      unlockedSkills: [],
      minConcealmentTier: 0,
      activeLegitRecurringCount: 0,
      vehicleCount: 1,
      volume,
    })
    expect(breakdown.volumePenalty).toBeCloseTo(2 * sd.perVolumeStep, 5)
  })

  it('no volume penalty below threshold', () => {
    const { breakdown } = smuggleHopDetection({
      routeSegment: makeRoute(),
      allRoutes: [],
      globalHeat: 0,
      arrivalCityId: 'new_york',
      inspectorCityId: null,
      interpolCityId: null,
      interpolAdditionalIds: [],
      unlockedSkills: [],
      minConcealmentTier: 0,
      activeLegitRecurringCount: 0,
      vehicleCount: 1,
      volume: 10,
    })
    expect(breakdown.volumePenalty).toBe(0)
  })

  it('checks threat at arrival city, not route endpoints', () => {
    // Inspector at arrival city (new_york) but NOT at route origin (chicago)
    const { breakdown } = smuggleHopDetection({
      routeSegment: makeRoute(),
      allRoutes: [],
      globalHeat: 0,
      arrivalCityId: 'new_york',
      inspectorCityId: 'new_york',
      interpolCityId: null,
      interpolAdditionalIds: [],
      unlockedSkills: [],
      minConcealmentTier: 0,
      activeLegitRecurringCount: 0,
      vehicleCount: 1,
      volume: 10,
    })
    expect(breakdown.threatBonus).toBeCloseTo(CONFIG.detection.inspectorBonus, 5)
  })
})
