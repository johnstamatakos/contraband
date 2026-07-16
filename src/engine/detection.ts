import type { Route, DetectionBreakdown } from './gameState'
import { CONFIG } from './config'

// ─── Shared detection helpers ────────────────────────────────────────────────

function getThreatMultiplier(unlockedSkills: string[]): number {
  return unlockedSkills.includes('shadow_3')
    ? CONFIG.skills.effects.shadow_3.threatBonusMultiplier
    : 1
}

function getSkillsReduction(unlockedSkills: string[]): number {
  return unlockedSkills.includes('shadow_1')
    ? CONFIG.skills.effects.shadow_1.detectionReduction
    : 0
}

function getConcealmentReduction(tier: 0 | 1 | 2): number {
  const cu = CONFIG.vehicleUpgrades.effects.concealment
  return tier === 2 ? cu.tier2DetectionReduction : tier === 1 ? cu.tier1DetectionReduction : 0
}

function getLegitCover(activeLegitRecurringCount: number): number {
  const d = CONFIG.detection
  return Math.min(activeLegitRecurringCount * d.perLegitRecurring, d.maxLegitRecurringBonus)
}

/** Compute route-level base factors (base, heat, global heat, consecutive runs). */
function getBaseFactors(route: Route, globalHeat: number) {
  const d = CONFIG.detection
  return {
    base: d.baseChance,
    routeHeat: route.heat * d.perRouteHeat,
    globalHeatAdded: globalHeat * d.perGlobalHeatPoint,
    consecutiveRuns: Math.min(route.consecutiveIllicitRuns, d.maxConsecutiveRuns) * d.perConsecutiveRun,
  }
}

/**
 * Compute Interpol threat bonus for a set of cities to check against.
 * Returns the raw (pre-multiplier) threat bonus.
 */
function getInterpolBonus(
  allRoutes: Route[],
  interpolPositions: string[],
  checkCities: string[],
): number {
  const d = CONFIG.detection
  let bonus = 0
  for (const pos of interpolPositions) {
    if (checkCities.includes(pos)) {
      bonus = Math.max(bonus, d.interpolBonus)
    } else {
      const isAdjacent = allRoutes.some(r =>
        r.status === 'open' &&
        (r.tier === 'international' || r.tier === 'long_haul') &&
        (r.origin === pos || r.destination === pos) &&
        checkCities.some(c => r.origin === c || r.destination === c),
      )
      if (isAdjacent) bonus = Math.max(bonus, d.interpolAdjacentBonus)
    }
  }
  return bonus
}

function clampProbability(raw: number): number {
  const d = CONFIG.detection
  return Math.min(d.maxProbability, Math.max(d.minProbability, raw))
}

// ─── Contract detection (legacy illicit + existing system) ───────────────────

type DetectionParams = {
  route: Route
  allRoutes: Route[]
  globalHeat: number
  inspectorCityId: string | null
  interpolCityId: string | null
  unlockedSkills?: string[]
  concealmentTier?: 0 | 1 | 2
  activeLegitRecurringCount?: number
  interpolAdditionalIds?: string[]
}

export function detectionChanceWithBreakdown(p: DetectionParams): { prob: number; breakdown: DetectionBreakdown } {
  const {
    route, allRoutes, globalHeat, inspectorCityId, interpolCityId,
    unlockedSkills = [], concealmentTier = 0,
    activeLegitRecurringCount = 0, interpolAdditionalIds = [],
  } = p

  const { base, routeHeat, globalHeatAdded, consecutiveRuns } = getBaseFactors(route, globalHeat)
  const isIntl = route.tier === 'international' || route.tier === 'long_haul'
  const threatMultiplier = getThreatMultiplier(unlockedSkills)

  // Threat bonus: inspector at endpoints (domestic/regional) or interpol (international/long_haul)
  let rawThreatBonus = 0
  if (!isIntl) {
    if (inspectorCityId !== null &&
        (inspectorCityId === route.origin || inspectorCityId === route.destination)) {
      rawThreatBonus = CONFIG.detection.inspectorBonus
    }
  } else {
    const positions = [...(interpolCityId !== null ? [interpolCityId] : []), ...interpolAdditionalIds]
    rawThreatBonus = getInterpolBonus(allRoutes, positions, [route.origin, route.destination])
  }
  const threatBonus = rawThreatBonus * threatMultiplier

  const skillsReduction = getSkillsReduction(unlockedSkills)
  const concealmentReduction = getConcealmentReduction(concealmentTier)
  const legitCover = getLegitCover(activeLegitRecurringCount)

  const raw = base + routeHeat + globalHeatAdded + consecutiveRuns + threatBonus
    - skillsReduction - concealmentReduction - legitCover
  const final = clampProbability(raw)

  return {
    prob: final,
    breakdown: {
      base, routeHeat, globalHeat: globalHeatAdded, consecutiveRuns, threatBonus,
      skillsReduction, concealmentReduction, legitCover,
      vehiclePenalty: 0, volumePenalty: 0, final,
    },
  }
}

/** Convenience wrapper — returns probability only. */
export function detectionChance(
  route: Route, allRoutes: Route[], globalHeat: number,
  inspectorCityId: string | null, interpolCityId: string | null,
  unlockedSkills: string[] = [], concealmentTier: 0 | 1 | 2 = 0,
  activeLegitRecurringCount = 0, interpolAdditionalIds: string[] = [],
): number {
  return detectionChanceWithBreakdown({
    route, allRoutes, globalHeat, inspectorCityId, interpolCityId,
    unlockedSkills, concealmentTier, activeLegitRecurringCount, interpolAdditionalIds,
  }).prob
}

// ─── Smuggling run per-hop detection ────────────────────────────────────────

export type SmuggleDetectionParams = {
  routeSegment: Route
  allRoutes: Route[]
  globalHeat: number
  arrivalCityId: string
  inspectorCityId: string | null
  interpolCityId: string | null
  interpolAdditionalIds: string[]
  unlockedSkills: string[]
  minConcealmentTier: 0 | 1 | 2
  activeLegitRecurringCount: number
  vehicleCount: number
  volume: number
}

export function smuggleHopDetection(p: SmuggleDetectionParams): { prob: number; breakdown: DetectionBreakdown } {
  const {
    routeSegment, allRoutes, globalHeat, arrivalCityId,
    inspectorCityId, interpolCityId, interpolAdditionalIds,
    unlockedSkills, minConcealmentTier, activeLegitRecurringCount,
    vehicleCount, volume,
  } = p

  const { base, routeHeat, globalHeatAdded, consecutiveRuns } = getBaseFactors(routeSegment, globalHeat)
  const isIntl = routeSegment.tier === 'international' || routeSegment.tier === 'long_haul'
  const threatMultiplier = getThreatMultiplier(unlockedSkills)

  // Threat bonus: check at arrival city specifically
  let rawThreatBonus = 0
  if (!isIntl) {
    if (inspectorCityId === arrivalCityId) rawThreatBonus = CONFIG.detection.inspectorBonus
  } else {
    const positions = [...(interpolCityId !== null ? [interpolCityId] : []), ...interpolAdditionalIds]
    rawThreatBonus = getInterpolBonus(allRoutes, positions, [arrivalCityId])
  }
  const threatBonus = rawThreatBonus * threatMultiplier

  const skillsReduction = getSkillsReduction(unlockedSkills)
  const concealmentReduction = getConcealmentReduction(minConcealmentTier)
  const legitCover = getLegitCover(activeLegitRecurringCount)

  // Smuggling-specific penalties
  const sd = CONFIG.smuggling.detection
  const vehiclePenalty = Math.max(0, vehicleCount - 1) * sd.perExtraVehicle
  const volumePenalty = Math.max(0, Math.floor((volume - sd.volumeThreshold) / sd.volumeStepSize)) * sd.perVolumeStep

  const raw = base + routeHeat + globalHeatAdded + consecutiveRuns + threatBonus
    + vehiclePenalty + volumePenalty - skillsReduction - concealmentReduction - legitCover
  const final = clampProbability(raw)

  return {
    prob: final,
    breakdown: {
      base, routeHeat, globalHeat: globalHeatAdded, consecutiveRuns, threatBonus,
      skillsReduction, concealmentReduction, legitCover,
      vehiclePenalty, volumePenalty, final,
    },
  }
}

// ─── Vehicle requirement check ──────────────────────────────────────────────

export function meetsVehicleRequirements(
  vehicleUpgrades: { cargo: number; engine: number; concealment: number; range: number },
  requirements: Partial<Record<'cargo' | 'engine' | 'concealment' | 'range', 1 | 2>>,
): boolean {
  for (const [key, minTier] of Object.entries(requirements) as ['cargo' | 'engine' | 'concealment' | 'range', 1 | 2][]) {
    if ((vehicleUpgrades[key] ?? 0) < minTier) return false
  }
  return true
}
