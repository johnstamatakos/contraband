import { getCityName } from '../data/cities'
import type { GameState } from './gameState'
import { makeEvent, INSPECTOR_TIERS, INTERPOL_TIERS } from './engineHelpers'
import type { StepResult } from './engineHelpers'
import { CONFIG } from './config'

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
    arrived:        'Interpol agents spotted in',
    moved:          'Interpol agent moved to',
    illicitWarning: ' — international operation flagged!',
  },
}

// ── Geographic restrictions ───────────────────────────────────────────────────

/** Inspector is confined to these North American cities only. */
const NORTH_AMERICA_CITIES = new Set([
  'chicago', 'new_york', 'houston', 'miami', 'toronto', 'los_angeles', 'mexico_city',
])

// ── Movement logic ────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  return arr.sort(() => Math.random() - 0.5)
}

/**
 * Move a threat entity along its tier-restricted route graph.
 *
 * Inspector — confined to North American cities; lighter penalties.
 * Interpol  — always outside North America; maintains 2–3 simultaneous positions.
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

  const allTierRoutes = state.routes.filter(r => r.status === 'open' && tiers.has(r.tier))

  // ── Inspector: North America only ──────────────────────────────────────────
  if (role === 'inspector') {
    const naRoutes = allTierRoutes.filter(
      r => NORTH_AMERICA_CITIES.has(r.origin) && NORTH_AMERICA_CITIES.has(r.destination),
    )

    if (threat.currentCityId === null) {
      const openCities = [...new Set(naRoutes.flatMap(r => [r.origin, r.destination]))]
      if (openCities.length === 0) return { state, events: [] }
      const cityId = openCities[Math.floor(Math.random() * openCities.length)]!
      return {
        state: { ...state, [role]: { ...threat, currentCityId: cityId } } as GameState,
        events: [makeEvent(gameTimeMs, `${copy.arrived} ${getCityName(cityId)}.`, 'danger')],
      }
    }

    const adjacent = [
      ...new Set(
        naRoutes
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
      return route && tiers.has(route.tier) &&
        (route.origin === nextCityId || route.destination === nextCityId)
    })

    return {
      state: {
        ...state,
        [role]: { ...threat, currentCityId: nextCityId, probableNextCityId: probableCityId },
      } as GameState,
      events: [makeEvent(gameTimeMs,
        `${copy.moved} ${getCityName(nextCityId)}${illicitNearby ? copy.illicitWarning : ''}`,
        illicitNearby ? 'danger' : 'warning',
      )],
    }
  }

  // ── Interpol: outside North America, 2–3 simultaneous positions ────────────

  // Use ALL open routes (any tier) to build the non-NA city pool and movement graph.
  // INTERPOL_TIERS only determines detection/bust eligibility, not Interpol's movement.
  const allOpenRoutes = state.routes.filter(r => r.status === 'open')

  // Eligible non-NA cities from the full open route graph
  const nonNACities = [
    ...new Set(
      allOpenRoutes
        .flatMap(r => [r.origin, r.destination])
        .filter(c => !NORTH_AMERICA_CITIES.has(c)),
    ),
  ]
  if (nonNACities.length === 0) return { state, events: [] }

  if (threat.currentCityId === null) {
    // First appearance — pick up to 3 non-NA cities
    const candidates = shuffle([...nonNACities])
    const primary    = candidates[0]!
    const additionals = candidates.slice(1, 3)
    return {
      state: {
        ...state,
        [role]: { ...threat, currentCityId: primary, additionalCityIds: additionals },
      } as GameState,
      events: [makeEvent(gameTimeMs,
        `${copy.arrived} ${[primary, ...additionals].map(getCityName).join(', ')}.`,
        'danger',
      )],
    }
  }

  // Move primary along the full open route graph, staying non-NA
  const adjacent = [
    ...new Set(
      allOpenRoutes
        .filter(r => r.origin === threat.currentCityId || r.destination === threat.currentCityId)
        .flatMap(r => [r.origin, r.destination])
        .filter(c => c !== threat.currentCityId && !NORTH_AMERICA_CITIES.has(c)),
    ),
  ]

  const nextCityId = adjacent.length > 0
    ? adjacent[Math.floor(Math.random() * adjacent.length)]!
    : nonNACities[Math.floor(Math.random() * nonNACities.length)]!

  const probableCityId = adjacent.find(c => c !== nextCityId) ?? null

  // Rotate additional positions to fresh random non-NA cities (not the primary)
  // At high rep, Interpol maintains a 3rd simultaneous position
  const maxAdditional = state.reputation >= CONFIG.repEscalation.interpolExtraPositionAtRep ? 3 : 2
  const othersPool = shuffle(nonNACities.filter(c => c !== nextCityId))
  const newAdditionals = othersPool.slice(0, maxAdditional)

  const illicitNearby = state.shipmentsInTransit.some(s => {
    if (!s.isIllicit) return false
    const route = state.routes.find(r => r.id === s.routeId)
    const allPositions = [nextCityId, ...newAdditionals]
    return route && tiers.has(route.tier) &&
      allPositions.some(p => route.origin === p || route.destination === p)
  })

  return {
    state: {
      ...state,
      [role]: {
        ...threat,
        currentCityId:     nextCityId,
        probableNextCityId: probableCityId,
        additionalCityIds:  newAdditionals,
      },
    } as GameState,
    events: [makeEvent(gameTimeMs,
      `${copy.moved} ${getCityName(nextCityId)}${illicitNearby ? copy.illicitWarning : ''}`,
      illicitNearby ? 'danger' : 'warning',
    )],
  }
}
