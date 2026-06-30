import { Graphics } from 'pixi.js'
import type { GeoProjection } from 'd3-geo'
import type { Route, VehicleType, WeatherEvent } from '../engine/gameState'
import type { ProjectedCity } from './cityLayer'
import { projectCoord } from './projection'
import { CITIES } from '../data/cities'

// Colors per vehicle type (matching spec: blue=plane, purple=ship, amber=truck)
const VEHICLE_COLORS: Record<VehicleType, number> = {
  plane: 0x3b82f6,   // blue-500
  ship:  0x8b5cf6,   // violet-500
  truck: 0xf59e0b,   // amber-500
}
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

function drawDashedLine(
  g: Graphics,
  x1: number, y1: number,
  x2: number, y2: number,
  dashLen: number,
  gapLen: number,
  offset: number,
): void {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return

  const total = dashLen + gapLen
  let pos = -(offset % total)
  while (pos < len) {
    const s = Math.max(0, pos)
    const e = Math.min(len, pos + dashLen)
    if (e > s) {
      const t1 = s / len, t2 = e / len
      g.moveTo(x1 + dx * t1, y1 + dy * t1)
      g.lineTo(x1 + dx * t2, y1 + dy * t2)
    }
    pos += total
  }
}

function endpoints(
  route: Route,
  cityMap: Map<string, ProjectedCity>,
  projection: GeoProjection,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const o = cityMap.get(route.origin)
  const d = cityMap.get(route.destination)
  if (o && d) return { x1: o.px, y1: o.py, x2: d.px, y2: d.py }

  // Fallback: project from CITIES data
  const oc = CITIES.find(c => c.id === route.origin)
  const dc = CITIES.find(c => c.id === route.destination)
  if (!oc || !dc) return null
  const op = projectCoord(projection, oc.lon, oc.lat)
  const dp = projectCoord(projection, dc.lon, dc.lat)
  if (!op || !dp) return null
  return { x1: op[0], y1: op[1], x2: dp[0], y2: dp[1] }
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
  weatherEvents: WeatherEvent[] = [],
): void {
  g.clear()

  // 1. Closed candidate routes (bottom layer, faint)
  for (const route of routes) {
    if (route.status !== 'closed') continue
    if (!routeVisible(route, filter)) continue
    const ep = endpoints(route, cityMap, projection)
    if (!ep) continue
    drawDashedLine(g, ep.x1, ep.y1, ep.x2, ep.y2, CLOSED_DASH, CLOSED_GAP, 0)
    g.stroke({ color: CLOSED_COLOR, width: 1, alpha: 0.25 })
  }

  // 2. Pending routes (amber animated)
  for (const route of routes) {
    if (route.status !== 'pending') continue
    if (!routeVisible(route, filter)) continue
    const ep = endpoints(route, cityMap, projection)
    if (!ep) continue
    drawDashedLine(g, ep.x1, ep.y1, ep.x2, ep.y2, DASH_LEN, GAP_LEN, dashOffset * 1.5)
    g.stroke({ color: PENDING_COLOR, width: 1.5, alpha: 0.85 })
  }

  // 3. Open routes — heat/flagged glow (drawn first so route color renders on top)
  for (const route of routes) {
    if (route.status !== 'open') continue
    if (route.heat <= 0 && route.flaggedTurnsRemaining <= 0) continue
    if (!routeVisible(route, filter)) continue
    const ep = endpoints(route, cityMap, projection)
    if (!ep) continue

    if (route.flaggedTurnsRemaining > 0) {
      // Orange pulsing overlay for flagged (under investigation) routes
      const pulse = (Math.sin(dashOffset * 0.08) + 1) / 2
      const alpha = 0.35 + pulse * 0.35
      drawDashedLine(g, ep.x1, ep.y1, ep.x2, ep.y2, DASH_LEN, GAP_LEN, dashOffset)
      g.stroke({ color: 0xf97316, width: OPEN_WIDTH + 3, alpha })
    } else if (route.heat > 0) {
      // Red glow for hot routes — intensity scales with heat level
      const alpha = (route.heat / 5) * 0.55
      drawDashedLine(g, ep.x1, ep.y1, ep.x2, ep.y2, DASH_LEN, GAP_LEN, dashOffset)
      g.stroke({ color: 0xef4444, width: OPEN_WIDTH + 2.5, alpha })
    }
  }

  // 4. Open routes — main color (on top of heat overlay)
  for (const route of routes) {
    if (route.status !== 'open') continue
    if (!routeVisible(route, filter)) continue
    const ep = endpoints(route, cityMap, projection)
    if (!ep) continue
    drawDashedLine(g, ep.x1, ep.y1, ep.x2, ep.y2, DASH_LEN, GAP_LEN, dashOffset)
    g.stroke({ color: routeColor(route), width: OPEN_WIDTH, alpha: 0.8 })
  }

}
