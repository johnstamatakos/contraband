import type { Route, DetectionBreakdown } from './gameState'
import { CONFIG } from './config'

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

/**
 * Returns detection probability + per-factor breakdown.
 * Inspector covers domestic/regional; Interpol covers international/long_haul.
 */
export function detectionChanceWithBreakdown(p: DetectionParams): { prob: number; breakdown: DetectionBreakdown } {
  const {
    route,
    allRoutes,
    globalHeat,
    inspectorCityId,
    interpolCityId,
    unlockedSkills = [],
    concealmentTier = 0,
    activeLegitRecurringCount = 0,
    interpolAdditionalIds = [],
  } = p

  const d = CONFIG.detection
  const isIntl = route.tier === 'international' || route.tier === 'long_haul'

  const base             = d.baseChance
  const routeHeat        = route.heat * d.perRouteHeat
  const globalHeatAdded  = globalHeat * d.perGlobalHeatPoint
  const consecutiveRuns  = Math.min(route.consecutiveIllicitRuns, d.maxConsecutiveRuns) * d.perConsecutiveRun

  // shadow_3: Counter-Intel — reduces both Inspector and Interpol detection bonuses
  const threatMultiplier = unlockedSkills.includes('shadow_3')
    ? CONFIG.skills.effects.shadow_3.threatBonusMultiplier
    : 1

  let rawThreatBonus = 0
  if (!isIntl) {
    if (inspectorCityId !== null &&
        (inspectorCityId === route.origin || inspectorCityId === route.destination)) {
      rawThreatBonus = d.inspectorBonus
    }
  } else {
    const allInterpolPositions = [
      ...(interpolCityId !== null ? [interpolCityId] : []),
      ...interpolAdditionalIds,
    ]
    for (const pos of allInterpolPositions) {
      if (pos === route.origin || pos === route.destination) {
        rawThreatBonus = Math.max(rawThreatBonus, d.interpolBonus)
      } else {
        const isAdjacent = allRoutes.some(r =>
          r.status === 'open' &&
          (r.tier === 'international' || r.tier === 'long_haul') &&
          (r.origin === pos || r.destination === pos) &&
          (r.origin === route.origin || r.origin === route.destination ||
           r.destination === route.origin || r.destination === route.destination),
        )
        if (isAdjacent) rawThreatBonus = Math.max(rawThreatBonus, d.interpolAdjacentBonus)
      }
    }
  }
  const threatBonus = rawThreatBonus * threatMultiplier

  // shadow_1: Ghost Protocol — flat reduction
  const skillsReduction = unlockedSkills.includes('shadow_1')
    ? CONFIG.skills.effects.shadow_1.detectionReduction
    : 0

  // Vehicle concealment
  const cu = CONFIG.vehicleUpgrades.effects.concealment
  const concealmentReduction = concealmentTier === 2
    ? cu.tier2DetectionReduction
    : concealmentTier === 1
    ? cu.tier1DetectionReduction
    : 0

  // Legit cover
  const legitCover = Math.min(
    activeLegitRecurringCount * d.perLegitRecurring,
    d.maxLegitRecurringBonus,
  )

  const raw = base + routeHeat + globalHeatAdded + consecutiveRuns + threatBonus
    - skillsReduction - concealmentReduction - legitCover
  const final = Math.min(d.maxProbability, Math.max(d.minProbability, raw))

  const breakdown: DetectionBreakdown = {
    base,
    routeHeat,
    globalHeat: globalHeatAdded,
    consecutiveRuns,
    threatBonus,
    skillsReduction,
    concealmentReduction,
    legitCover,
    contactsReduction: 0,
    vehiclePenalty: 0,
    volumePenalty: 0,
    final,
  }

  return { prob: final, breakdown }
}

/** Convenience wrapper — returns probability only. */
export function detectionChance(
  route: Route,
  allRoutes: Route[],
  globalHeat: number,
  inspectorCityId: string | null,
  interpolCityId: string | null,
  unlockedSkills: string[] = [],
  concealmentTier: 0 | 1 | 2 = 0,
  activeLegitRecurringCount = 0,
  interpolAdditionalIds: string[] = [],
): number {
  return detectionChanceWithBreakdown({
    route, allRoutes, globalHeat, inspectorCityId, interpolCityId,
    unlockedSkills, concealmentTier, activeLegitRecurringCount, interpolAdditionalIds,
  }).prob
}

// ─── Smuggling run per-hop detection ──────────────────────────────────────────

export type SmuggleDetectionParams = {
  routeSegment: Route             // the specific route for this hop
  allRoutes: Route[]
  globalHeat: number
  arrivalCityId: string           // threat check at the arrival city of this hop
  inspectorCityId: string | null
  interpolCityId: string | null
  interpolAdditionalIds: string[]
  unlockedSkills: string[]
  minConcealmentTier: 0 | 1 | 2  // weakest vehicle in convoy
  activeLegitRecurringCount: number
  vehicleCount: number            // convoy size
  volume: number                  // units being smuggled
}

/**
 * Per-hop detection for smuggling runs.
 * Uses same core formula as contract detection but adds vehicle count and volume
 * penalties, and checks threat presence at the arrival city specifically.
 */
export function smuggleHopDetection(p: SmuggleDetectionParams): { prob: number; breakdown: DetectionBreakdown } {
  const {
    routeSegment,
    allRoutes,
    globalHeat,
    arrivalCityId,
    inspectorCityId,
    interpolCityId,
    interpolAdditionalIds,
    unlockedSkills,
    minConcealmentTier,
    activeLegitRecurringCount,
    vehicleCount,
    volume,
  } = p

  const d = CONFIG.detection
  const sd = CONFIG.smuggling.detection
  const isIntl = routeSegment.tier === 'international' || routeSegment.tier === 'long_haul'

  const base             = d.baseChance
  const routeHeat        = routeSegment.heat * d.perRouteHeat
  const globalHeatAdded  = globalHeat * d.perGlobalHeatPoint
  const consecutiveRuns  = Math.min(routeSegment.consecutiveIllicitRuns, d.maxConsecutiveRuns) * d.perConsecutiveRun

  // Threat check at the arrival city
  const threatMultiplier = unlockedSkills.includes('shadow_3')
    ? CONFIG.skills.effects.shadow_3.threatBonusMultiplier
    : 1

  let rawThreatBonus = 0
  if (!isIntl) {
    if (inspectorCityId === arrivalCityId) {
      rawThreatBonus = d.inspectorBonus
    }
  } else {
    const allInterpolPositions = [
      ...(interpolCityId !== null ? [interpolCityId] : []),
      ...interpolAdditionalIds,
    ]
    for (const pos of allInterpolPositions) {
      if (pos === arrivalCityId) {
        rawThreatBonus = Math.max(rawThreatBonus, d.interpolBonus)
      } else {
        // Check if interpol is adjacent to arrival city
        const isAdjacent = allRoutes.some(r =>
          r.status === 'open' &&
          (r.tier === 'international' || r.tier === 'long_haul') &&
          (r.origin === pos || r.destination === pos) &&
          (r.origin === arrivalCityId || r.destination === arrivalCityId),
        )
        if (isAdjacent) rawThreatBonus = Math.max(rawThreatBonus, d.interpolAdjacentBonus)
      }
    }
  }
  const threatBonus = rawThreatBonus * threatMultiplier

  // Skills
  const skillsReduction = unlockedSkills.includes('shadow_1')
    ? CONFIG.skills.effects.shadow_1.detectionReduction
    : 0

  // Concealment — weakest vehicle in convoy
  const cu = CONFIG.vehicleUpgrades.effects.concealment
  const concealmentReduction = minConcealmentTier === 2
    ? cu.tier2DetectionReduction
    : minConcealmentTier === 1
    ? cu.tier1DetectionReduction
    : 0

  // Legit cover
  const legitCover = Math.min(
    activeLegitRecurringCount * d.perLegitRecurring,
    d.maxLegitRecurringBonus,
  )

  // Smuggling-specific penalties
  const vehiclePenalty = Math.max(0, vehicleCount - 1) * sd.perExtraVehicle
  const volumePenalty = Math.max(0, Math.floor((volume - sd.volumeThreshold) / sd.volumeStepSize)) * sd.perVolumeStep

  const raw = base + routeHeat + globalHeatAdded + consecutiveRuns + threatBonus
    + vehiclePenalty + volumePenalty
    - skillsReduction - concealmentReduction - legitCover
  const final = Math.min(d.maxProbability, Math.max(d.minProbability, raw))

  const breakdown: DetectionBreakdown = {
    base,
    routeHeat,
    globalHeat: globalHeatAdded,
    consecutiveRuns,
    threatBonus,
    skillsReduction,
    concealmentReduction,
    legitCover,
    contactsReduction: 0,
    vehiclePenalty,
    volumePenalty,
    final,
  }

  return { prob: final, breakdown }
}

/** Check if all vehicle requirements are met for a given vehicle's upgrades. */
export function meetsVehicleRequirements(
  vehicleUpgrades: { cargo: number; engine: number; concealment: number; range: number },
  requirements: Partial<Record<'cargo' | 'engine' | 'concealment' | 'range', 1 | 2>>,
): boolean {
  for (const [key, minTier] of Object.entries(requirements) as ['cargo' | 'engine' | 'concealment' | 'range', 1 | 2][]) {
    if ((vehicleUpgrades[key] ?? 0) < minTier) return false
  }
  return true
}
