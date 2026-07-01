import { getCityName } from '../data/cities'
import type { GameState } from './gameState'
import { makeEvent, INSPECTOR_TIERS, INTERPOL_TIERS } from './engineHelpers'
import type { StepResult } from './engineHelpers'

// ── Threat metadata ───────────────────────────────────────────────────────────

export type ThreatRole = 'inspector' | 'interpol'

const THREAT_TIERS: Record<ThreatRole, ReadonlySet<string>> = {
  inspector: INSPECTOR_TIERS,
  interpol:  INTERPOL_TIERS,
}

const THREAT_COPY: Record<ThreatRole, { arrived: string; moved: string; illicitWarning: string }> = {
  inspector: {
    arrived:        'Inspector arrived in',
    moved:          'Inspector moved to',
    illicitWarning: ' — suspicious activity detected!',
  },
  interpol: {
    arrived:        'Interpol agent spotted in',
    moved:          'Interpol agent moved to',
    illicitWarning: ' — international operation flagged!',
  },
}

// ── Movement logic ────────────────────────────────────────────────────────────

/**
 * Move a threat entity (inspector or interpol) along its tier-restricted route graph.
 * Both entities share the same movement algorithm; only tiers and event copy differ.
 */
export function moveThreat(
  state: GameState,
  role: ThreatRole,
  gameTimeMs: number,
): StepResult {
  const threat = state[role]
  const tiers  = THREAT_TIERS[role]
  const copy   = THREAT_COPY[role]

  if (state.turn < threat.appearsOnTurn) return { state, events: [] }

  const tierRoutes = state.routes.filter(r => r.status === 'open' && tiers.has(r.tier))

  // First appearance — pick a random city on the relevant graph
  if (threat.currentCityId === null) {
    const openCities = [...new Set(tierRoutes.flatMap(r => [r.origin, r.destination]))]
    if (openCities.length === 0) return { state, events: [] }
    const cityId = openCities[Math.floor(Math.random() * openCities.length)]!
    return {
      state: { ...state, [role]: { ...threat, currentCityId: cityId } } as GameState,
      events: [makeEvent(gameTimeMs, `${copy.arrived} ${getCityName(cityId)}.`, 'danger')],
    }
  }

  // Move to an adjacent city on the same tier graph
  const adjacent = [
    ...new Set(
      tierRoutes
        .filter(r => r.origin === threat.currentCityId || r.destination === threat.currentCityId)
        .flatMap(r => [r.origin, r.destination])
        .filter(c => c !== threat.currentCityId),
    ),
  ]
  if (adjacent.length === 0) return { state, events: [] }

  const nextCityId     = adjacent[Math.floor(Math.random() * adjacent.length)]!
  const probableCityId = adjacent.find(c => c !== nextCityId) ?? null

  const illicitNearby = state.shipmentsInTransit.some(s => {
    if (!s.isIllicit) return false
    const route = state.routes.find(r => r.id === s.routeId)
    return route && tiers.has(route.tier) && (route.origin === nextCityId || route.destination === nextCityId)
  })

  return {
    state: { ...state, [role]: { ...threat, currentCityId: nextCityId, probableNextCityId: probableCityId } } as GameState,
    events: [makeEvent(gameTimeMs,
      `${copy.moved} ${getCityName(nextCityId)}${illicitNearby ? copy.illicitWarning : ''}`,
      illicitNearby ? 'danger' : 'warning',
    )],
  }
}
