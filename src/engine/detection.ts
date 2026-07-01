import type { Route } from './gameState'
import { CONFIG } from './config'

/**
 * Returns the probability (0–maxProbability) that an illicit shipment on this
 * route is caught. All factors are tunable via CONFIG.detection.
 *
 * Inspector covers domestic/regional routes.
 * Interpol covers international/long_haul routes.
 *   - Direct presence at origin/destination: interpolBonus
 *   - 1 hop away on the international graph:  interpolAdjacentBonus
 */
export function detectionChance(
  route: Route,
  allRoutes: Route[],
  globalHeat: number,
  inspectorCityId: string | null,
  interpolCityId: string | null,
  unlockedSkills: string[] = [],
  concealmentTier: 0 | 1 | 2 = 0,
  activeLegitRecurringCount = 0,
): number {
  const d = CONFIG.detection
  const isIntl = route.tier === 'international' || route.tier === 'long_haul'

  let p = d.baseChance
  p += route.heat * d.perRouteHeat
  p += globalHeat * d.perGlobalHeatPoint
  p += Math.min(route.consecutiveIllicitRuns, d.maxConsecutiveRuns) * d.perConsecutiveRun

  // shadow_3: Counter-Intel — reduces both Inspector and Interpol detection bonuses
  const threatMultiplier = unlockedSkills.includes('shadow_3')
    ? CONFIG.skills.effects.shadow_3.threatBonusMultiplier
    : 1

  if (!isIntl) {
    // Inspector: domestic/regional routes — direct presence only
    if (inspectorCityId !== null &&
        (inspectorCityId === route.origin || inspectorCityId === route.destination)) {
      p += d.inspectorBonus * threatMultiplier
    }
  } else {
    // Interpol: international/long_haul routes
    if (interpolCityId !== null) {
      if (interpolCityId === route.origin || interpolCityId === route.destination) {
        // Direct presence — full bonus
        p += d.interpolBonus * threatMultiplier
      } else {
        // 1-hop adjacency on the international/long_haul graph — smaller bonus
        const isAdjacent = allRoutes.some(r =>
          r.status === 'open' &&
          (r.tier === 'international' || r.tier === 'long_haul') &&
          (r.origin === interpolCityId || r.destination === interpolCityId) &&
          (r.origin === route.origin || r.origin === route.destination ||
           r.destination === route.origin || r.destination === route.destination),
        )
        if (isAdjacent) p += d.interpolAdjacentBonus * threatMultiplier
      }
    }
  }

  // shadow_1: Ghost Protocol — flat detection reduction
  if (unlockedSkills.includes('shadow_1')) {
    p -= CONFIG.skills.effects.shadow_1.detectionReduction
  }

  // Vehicle concealment upgrade
  const cu = CONFIG.vehicleUpgrades.effects.concealment
  if (concealmentTier === 2) p -= cu.tier2DetectionReduction
  else if (concealmentTier === 1) p -= cu.tier1DetectionReduction

  // Legit cover: active recurring legit shipments provide plausible deniability
  const coverReduction = Math.min(
    activeLegitRecurringCount * d.perLegitRecurring,
    d.maxLegitRecurringBonus,
  )
  p -= coverReduction

  return Math.min(d.maxProbability, Math.max(0, p))
}
