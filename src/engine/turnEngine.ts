/**
 * Barrel re-export — all turn-resolution logic lives in:
 *   weeklyTick.ts     — the weekly tick pipeline (forecast → costs → contracts → threats → heat → turn)
 *   arrivalResolver.ts — resolves a single shipment arrival (detection, payout, bust, auto-redispatch)
 */
export { resolveWeeklyTick, checkWinLose, INTERPOL_TIERS } from './weeklyTick'
export { resolveArrival } from './arrivalResolver'
