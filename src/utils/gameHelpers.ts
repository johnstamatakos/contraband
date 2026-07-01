import { CONFIG } from '../engine/config'
import type { Route } from '../engine/gameState'

// ── Upgrade bonuses ───────────────────────────────────────────────────────────

/**
 * Return the upgrade bonus for a given tier (0/1/2).
 * Useful for cargo, engine, and concealment upgrade calculations.
 */
export function getTierBonus(tier: 0 | 1 | 2, tier1Val: number, tier2Val: number): number {
  if (tier === 2) return tier2Val
  if (tier === 1) return tier1Val
  return 0
}

// ── Skill helpers ─────────────────────────────────────────────────────────────

/**
 * Return a numeric skill effect if the skill is unlocked, or `defaultValue` otherwise.
 * Works for both additive bonuses (default 0) and multipliers (default 1).
 *
 * @example
 *   getSkillEffect(skills, 'shadow_2', 'routeHeatExtraDecay')       // → 1 or 0
 *   getSkillEffect(skills, 'logistics_2', 'transitTimeMultiplier', 1) // → 0.90 or 1
 */
export function getSkillEffect(
  unlockedSkills: string[],
  skillId: string,
  effectKey: string,
  defaultValue = 0,
): number {
  if (!unlockedSkills.includes(skillId)) return defaultValue
  const effects = (CONFIG.skills.effects as Record<string, Record<string, number>>)[skillId]
  return effects?.[effectKey] ?? defaultValue
}

/**
 * Convert a numeric skill tier to its config key.
 * @example skillTierKey(2) → 'tier2'
 */
export function skillTierKey(tier: 1 | 2 | 3): 'tier1' | 'tier2' | 'tier3' {
  return `tier${tier}` as 'tier1' | 'tier2' | 'tier3'
}

// ── Route helpers ─────────────────────────────────────────────────────────────

/** Apply a heat delta to a route, clamped to [0, 5]. */
export function applyRouteHeat(route: Route, delta: number): Route {
  return { ...route, heat: Math.max(0, Math.min(5, route.heat + delta)) }
}
