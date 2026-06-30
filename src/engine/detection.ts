import type { Route } from './gameState'

/**
 * Returns the probability (0–0.80) that an illicit shipment on this route is caught.
 *
 * Factors:
 *  - 5% base
 *  - +8% per route heat level (heat 0–5 → 0–40%)
 *  - +0.2% per global heat point (0–100 → 0–20%)
 *  - +3% per consecutive illicit run on this route, capped at 5 runs (+0–15%)
 *  - +30% if the investigator is watching the origin or destination city
 */
export function detectionChance(
  route: Route,
  globalHeat: number,
  investigatorCityId: string | null,
): number {
  let p = 0.05
  p += route.heat * 0.08
  p += globalHeat * 0.002
  p += Math.min(route.consecutiveIllicitRuns, 5) * 0.03
  if (investigatorCityId !== null &&
      (investigatorCityId === route.origin || investigatorCityId === route.destination)) {
    p += 0.30
  }
  return Math.min(0.80, p)
}
