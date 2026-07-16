import { Graphics } from 'pixi.js'
import type { GeoProjection } from 'd3-geo'
import type { Route, VehicleType, WeatherEvent } from '../engine/gameState'
import type { ProjectedCity } from './cityLayer'
import { projectCoord } from './projection'
import { CITIES } from '../data/cities'

// When a route supports multiple vehicle types, use neutral
const MULTI_COLOR = 0x6b7280   // gray-500
const CLOSED_COLOR = 0x374151
const PENDING_COLOR = 0xfbbf24

const OPEN_WIDTH = 1.5
const DASH_LEN = 7
const GAP_LEN = 5
const CLOSED_DASH = 5
const CLOSED_GAP = 9

export type VehicleFilter = Record<VehicleType, boolean>
export const ALL_VEHICLES_VISIBLE: VehicleFilter = { truck: true, plane: true, ship: true }

function routeColor(_route: Route): number {
  return MULTI_COLOR
}

function routeVisible(route: Route, filter: VehicleFilter): boolean {
  // Show route if any of its allowed vehicles is toggled on
  return route.allowedVehicles.some(v => filter[v])
}

// ── Antimeridian helpers ───────────────────────────────────────────────────────

function crossesAntimeridian(lon1: number, lon2: number): boolean {
  return Math.abs(lon2 - lon1) > 180
}

// Interpolate the latitude where a segment crosses ±180° longitude.
// Works for both east-crossing and west-crossing paths.
function antimeridianCrossLat(lon1: number, lat1: number, lon2: number, lat2: number): number {
  // If lon2 - lon1 > 180, the shortest path goes west (wraps at -180/+180).
  const goingWest = (lon2 - lon1) > 180
  // Unwrap lon2 into the same "direction" as lon1
  const adjLon2  = goingWest ? lon2 - 360 : lon2 + 360
  const crossLon = goingWest ? -180 : 180
  const t = (crossLon - lon1) / (adjLon2 - lon1)
  return lat1 + (lat2 - lat1) * t
}

/**
 * Build screen-space point sub-arrays for a route, splitting at antimeridian crossings.
 * Routes without waypoints behave identically to the old single-segment approach.
 *
 * Returns an array of sub-arrays; draw each sub-array as a connected polyline.
 * Gaps between sub-arrays represent the antimeridian "teleport" on a flat map.
 */
export function getRouteSegments(
  route: Route,
  cityMap: Map<string, ProjectedCity>,
  projection: GeoProjection,
  waypoints: Record<string, [number, number][]>,
): [number, number][][] {
  const oc = CITIES.find(c => c.id === route.origin)
  const dc = CITIES.find(c => c.id === route.destination)
  if (!oc || !dc) return []

  const routeWaypoints: [number, number][] = waypoints[route.id] ?? []
  const geoPoints: [number, number][] = [
    [oc.lon, oc.lat],
    ...routeWaypoints,
    [dc.lon, dc.lat],
  ]

  // Resolve screen-space position: use cityMap for origin/destination (more accurate),
  // fall back to raw projectCoord for intermediate waypoints.
  function screenPt(i: number): [number, number] | null {
    const [lon, lat] = geoPoints[i]!
    if (i === 0) {
      const c = cityMap.get(route.origin)
      return c ? [c.px, c.py] : projectCoord(projection, lon, lat)
    }
    if (i === geoPoints.length - 1) {
      const c = cityMap.get(route.destination)
      return c ? [c.px, c.py] : projectCoord(projection, lon, lat)
    }
    return projectCoord(projection, lon, lat)
  }

  const segments: [number, number][][] = []
  let current: [number, number][] = []

  const first = screenPt(0)
  if (!first) return []
  current.push(first)

  for (let i = 0; i + 1 < geoPoints.length; i++) {
    const [lon1, lat1] = geoPoints[i]!
    const [lon2, lat2] = geoPoints[i + 1]!
    const next = screenPt(i + 1)
    if (!next) continue

    if (crossesAntimeridian(lon1, lon2)) {
      const crossLat  = antimeridianCrossLat(lon1, lat1, lon2, lat2)
      const goingWest = (lon2 - lon1) > 180
      // Use ±179.99 to stay just inside the projection's valid range
      const exitLon   = goingWest ? -179.99 : 179.99
      const entryLon  = goingWest ?  179.99 : -179.99

      const exitPt  = projectCoord(projection, exitLon, crossLat)
      const entryPt = projectCoord(projection, entryLon, crossLat)

      if (exitPt && entryPt) {
        current.push(exitPt)
        if (current.length >= 2) segments.push(current)
        current = [entryPt, next]
      } else {
        // Projection couldn't resolve the edge point — fall back to direct line
        current.push(next)
      }
    } else {
      current.push(next)
    }
  }

  if (current.length >= 2) segments.push(current)
  return segments
}

// ── Perpendicular offset helper ────────────────────────────────────────────────

// Shifts each point in a polyline by `offsetPx` pixels perpendicular to the
// local segment direction (left-hand side when walking origin→destination).
function offsetSegments(segments: [number, number][][], offsetPx: number): [number, number][][] {
  return segments.map(pts => {
    if (pts.length < 2) return pts
    return pts.map((pt, i) => {
      // Direction vector: use the segment this point belongs to
      const [ax, ay] = i < pts.length - 1 ? pts[i]! : pts[i - 1]!
      const [bx, by] = i < pts.length - 1 ? pts[i + 1]! : pts[i]!
      const dx = bx - ax
      const dy = by - ay
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 0.001) return pt
      // Perpendicular (left-hand): (-dy, dx) normalised
      const nx = -dy / len
      const ny =  dx / len
      return [pt[0] + nx * offsetPx, pt[1] + ny * offsetPx] as [number, number]
    })
  })
}

// ── Dashed-segment drawing ─────────────────────────────────────────────────────

// Draws animated dashes across multiple screen-space sub-arrays with a continuous
// dash phase — dashes flow uninterrupted across segment boundaries.
function drawDashedSegments(
  g: Graphics,
  segments: [number, number][][],
  dashLen: number,
  gapLen: number,
  offset: number,
): void {
  const total = dashLen + gapLen
  let cumLen = 0
  for (const pts of segments) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i]!
      const [x2, y2] = pts[i + 1]!
      const dx = x2 - x1
      const dy = y2 - y1
      const segLen = Math.sqrt(dx * dx + dy * dy)
      if (segLen < 0.5) { cumLen += segLen; continue }

      // Phase: at cumLen into the path, how far are we into a dash/gap cycle?
      let pos = -((cumLen + offset) % total)
      while (pos < segLen) {
        const s = Math.max(0, pos)
        const e = Math.min(segLen, pos + dashLen)
        if (e > s) {
          g.moveTo(x1 + dx * (s / segLen), y1 + dy * (s / segLen))
          g.lineTo(x1 + dx * (e / segLen), y1 + dy * (e / segLen))
        }
        pos += total
      }
      cumLen += segLen
    }
  }
}

export function buildRouteLayer(): Graphics {
  const g = new Graphics()
  g.label = 'routeLayer'
  return g
}

export function drawRoutes(
  g: Graphics,
  routes: Route[],
  cityMap: Map<string, ProjectedCity>,
  projection: GeoProjection,
  dashOffset: number,
  filter: VehicleFilter = ALL_VEHICLES_VISIBLE,
  _weatherEvents: WeatherEvent[] = [],
  waypoints: Record<string, [number, number][]> = {},
): void {
  g.clear()

  // 1. Closed candidate routes (bottom layer, faint)
  for (const route of routes) {
    if (route.status !== 'closed') continue
    if (!routeVisible(route, filter)) continue
    const segs = getRouteSegments(route, cityMap, projection, waypoints)
    if (!segs.length) continue
    drawDashedSegments(g, segs, CLOSED_DASH, CLOSED_GAP, 0)
    g.stroke({ color: CLOSED_COLOR, width: 1, alpha: 0.25 })
  }

  // 2. Pending routes (amber animated)
  for (const route of routes) {
    if (route.status !== 'pending') continue
    if (!routeVisible(route, filter)) continue
    const segs = getRouteSegments(route, cityMap, projection, waypoints)
    if (!segs.length) continue
    drawDashedSegments(g, segs, DASH_LEN, GAP_LEN, dashOffset * 1.5)
    g.stroke({ color: PENDING_COLOR, width: 1.5, alpha: 0.85 })
  }

  // 3. Open routes — heat/flagged glow (drawn first so route color renders on top)
  for (const route of routes) {
    if (route.status !== 'open') continue
    if (route.heat <= 0 && route.flaggedTurnsRemaining <= 0) continue
    if (!routeVisible(route, filter)) continue
    const segs = getRouteSegments(route, cityMap, projection, waypoints)
    if (!segs.length) continue

    // Glow applies to the illicit line (offset -2.5) when dual, else center
    const glowSegs = route.illicitLayerActive ? offsetSegments(segs, -2.5) : segs

    if (route.flaggedTurnsRemaining > 0) {
      const pulse = (Math.sin(dashOffset * 0.08) + 1) / 2
      const alpha = 0.35 + pulse * 0.35
      drawDashedSegments(g, glowSegs, DASH_LEN, GAP_LEN, dashOffset)
      g.stroke({ color: 0xf97316, width: OPEN_WIDTH + 3, alpha })
    } else if (route.heat > 0) {
      const alpha = (route.heat / 5) * 0.55
      drawDashedSegments(g, glowSegs, DASH_LEN, GAP_LEN, dashOffset)
      g.stroke({ color: 0xef4444, width: OPEN_WIDTH + 2.5, alpha })
    }
  }

  // 4. Open routes — main color (on top of heat overlay)
  for (const route of routes) {
    if (route.status !== 'open') continue
    if (!routeVisible(route, filter)) continue
    const segs = getRouteSegments(route, cityMap, projection, waypoints)
    if (!segs.length) continue

    if (route.illicitLayerActive) {
      // Two parallel lines: legit (gray, +2.5px) and illicit (red, −2.5px)
      const legitSegs   = offsetSegments(segs,  2.5)
      const illicitSegs = offsetSegments(segs, -2.5)
      drawDashedSegments(g, legitSegs,   DASH_LEN, GAP_LEN, dashOffset)
      g.stroke({ color: MULTI_COLOR, width: OPEN_WIDTH, alpha: 0.7 })
      drawDashedSegments(g, illicitSegs, DASH_LEN, GAP_LEN, dashOffset)
      g.stroke({ color: 0xef4444, width: OPEN_WIDTH, alpha: 0.65 })
    } else {
      drawDashedSegments(g, segs, DASH_LEN, GAP_LEN, dashOffset)
      g.stroke({ color: routeColor(route), width: OPEN_WIDTH, alpha: 0.8 })
    }
  }
}
