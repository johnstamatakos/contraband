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
