import { Container, Graphics } from 'pixi.js'
import type { GeoProjection } from 'd3-geo'
import type { ShipmentInTransit, Route, Vehicle, VehicleType } from '../engine/gameState'
import type { ProjectedCity } from './cityLayer'
import { getRouteSegments } from './routeLayer'

const VEHICLE_COLOR: Record<VehicleType, number> = {
  truck: 0xf59e0b,  // amber
  plane: 0x3b82f6,  // blue
  ship:  0x8b5cf6,  // violet
}

// ── Per-layer pool ────────────────────────────────────────────────────────────
const layerPools = new WeakMap<Container, Map<string, Container>>()

export function buildVehicleLayer(): Container {
  const c = new Container()
  c.label = 'vehicleLayer'
  layerPools.set(c, new Map())
  return c
}

// ── Shape drawing ─────────────────────────────────────────────────────────────
// All shapes: nose/bow points right (+x), local origin at centre.

/**
 * Wide-body commercial jet, top-down view. Nose points +x.
 * Proportions based on A320/A380 reference:
 *   - Fat oval fuselage (~28 px long, ~9 px wide)
 *   - Large swept wings with deep chord at root (~32 px total span)
 *   - 4 engine nacelles near the wing leading edge
 *   - Small swept horizontal tail stabilisers
 *   - Rounded nose, tapered tail
 */
function drawPlaneShape(g: Graphics, color: number): void {
  // ── Main wings (large, swept — drawn first so fuselage overlaps root) ────
  // Port wing: leading edge sweeps from (5,−4.5) to tip (2,−16);
  //            trailing edge from (−4,−4.5) to (−2,−16)
  g.poly([5, -4.5,  2, -16, -2, -16, -4, -4.5])
  g.fill({ color, alpha: 0.82 })
  // Starboard (y-mirror)
  g.poly([5,  4.5,  2,  16, -2,  16, -4,  4.5])
  g.fill({ color, alpha: 0.82 })

  // ── Horizontal tail stabilisers (≈ 40 % of main wing span) ──────────────
  g.poly([-9, -2.5, -11, -7.5, -14, -7, -13, -2.5])
  g.fill({ color, alpha: 0.82 })
  g.poly([-9,  2.5, -11,  7.5, -14,  7, -13,  2.5])
  g.fill({ color, alpha: 0.82 })

  // ── Fuselage — wide-body oval (sits on top of wing roots) ────────────────
  g.poly([14, 0,  13, -2,  8, -4,   1, -4.5,
          -6, -4, -11, -2.5, -14, 0,
          -11, 2.5, -6, 4,   1,  4.5, 8, 4, 13, 2])
  g.fill({ color, alpha: 1.0 })

  // ── Engine nacelles (4 dark circles near leading edge) ───────────────────
  // Spanwise positions: inboard ≈ 44 % semi-span, outboard ≈ 69 %
  // X placed at the leading-edge station for each spanwise position
  g.circle( 3.5, -7,   1.9)  // port inboard
  g.fill({ color: 0x000000, alpha: 0.44 })
  g.circle( 2.5, -11,  1.9)  // port outboard
  g.fill({ color: 0x000000, alpha: 0.44 })
  g.circle( 3.5,  7,   1.9)  // starboard inboard
  g.fill({ color: 0x000000, alpha: 0.44 })
  g.circle( 2.5,  11,  1.9)  // starboard outboard
  g.fill({ color: 0x000000, alpha: 0.44 })

  // ── Cockpit glazing highlight (small bright oval near nose) ───────────────
  g.circle(11, 0, 1.6)
  g.fill({ color: 0xffffff, alpha: 0.26 })
}

/**
 * Semi-truck top-down: long trailer + square cab.
 * Cab on the right (+x / front), trailer extends left.
 * Total ~28 × 11 px.
 */
function drawTruckShape(g: Graphics, color: number): void {
  // Trailer body (slightly dimmer — same colour, lower alpha)
  g.rect(-15, -4, 19, 8)
  g.fill({ color, alpha: 0.72 })
  g.rect(-15, -4, 19, 8)
  g.stroke({ color: 0x000000, width: 0.7, alpha: 0.28 })

  // Trailer corner brackets
  for (const [cx, cy] of [[-14.5, -4], [-14.5, 2.5], [2.5, -4], [2.5, 2.5]] as [number,number][]) {
    g.rect(cx, cy, 1.8, 1.5)
    g.fill({ color: 0x000000, alpha: 0.32 })
  }

  // Cab (full opacity — visually "heavier" than trailer)
  g.rect(4, -5, 11, 10)
  g.fill({ color, alpha: 1.0 })
  g.rect(4, -5, 11, 10)
  g.stroke({ color: 0x000000, width: 0.7, alpha: 0.28 })

  // Windshield (dark glass, front of cab)
  g.rect(10, -3, 4.5, 6)
  g.fill({ color: 0x000000, alpha: 0.52 })

  // Side windows / mirror outline
  g.rect(4.5, -4.5, 2, 3)
  g.fill({ color: 0x000000, alpha: 0.28 })
  g.rect(4.5,  1.5, 2, 3)
  g.fill({ color: 0x000000, alpha: 0.28 })

  // Fifth-wheel hitch divider
  g.moveTo(4, -1.5)
  g.lineTo(4,  1.5)
  g.stroke({ color: 0x000000, width: 1.5, alpha: 0.38 })
}

/**
 * Container ship top-down: very elongated hull, container deck rows, bridge amidships.
 * Total ~40 × 12 px.
 */
function drawShipShape(g: Graphics, color: number): void {
  // Hull silhouette (very elongated, tapered bow and stern)
  g.poly([20, 0, 17, -5, 9, -6, -11, -6, -17, -4, -19, 0,
          -17, 4, -11,  6,  9,  6,  17,  5])
  g.fill({ color, alpha: 1.0 })

  // Container deck — three horizontal bands create the row impression
  g.rect(-14, -5, 25, 2.5)   // port row (darker)
  g.fill({ color: 0x000000, alpha: 0.20 })
  g.rect(-14, -2.5, 25, 2.5) // centre row (lighter)
  g.fill({ color: 0xffffff, alpha: 0.08 })
  g.rect(-14,  0,  25, 2.5)  // mid-starboard row (darker)
  g.fill({ color: 0x000000, alpha: 0.14 })
  g.rect(-14,  2.5, 25, 2.5) // starboard row (slightly lighter)
  g.fill({ color: 0xffffff, alpha: 0.06 })

  // Vertical container dividers
  for (let x = -10; x <= 10; x += 4.5) {
    g.moveTo(x, -5)
    g.lineTo(x,  5)
    g.stroke({ color: 0x000000, width: 0.4, alpha: 0.22 })
  }

  // Bridge / superstructure block (midship)
  g.rect(-2, -3, 5, 6)
  g.fill({ color, alpha: 1.0 })
  g.rect(-2, -3, 5, 6)
  g.stroke({ color: 0x000000, width: 0.6, alpha: 0.30 })

  // Bow v-highlight
  g.poly([20, 0, 15, -4, 15, 4])
  g.fill({ color: 0xffffff, alpha: 0.16 })
}

// ── Container factory ─────────────────────────────────────────────────────────

function buildVehicleContainer(
  type: VehicleType,
  color: number,
  isIllicit: boolean,
  shipmentId: string,
  onHover?: (id: string | null, x: number, y: number) => void,
): Container {
  const c = new Container()

  const g = new Graphics()
  if (type === 'plane')     drawPlaneShape(g, color)
  else if (type === 'truck') drawTruckShape(g, color)
  else                       drawShipShape(g, color)
  c.addChild(g)

  if (isIllicit) {
    const ring = new Graphics()
    ring.circle(0, 0, 18)
    ring.stroke({ color: 0xef4444, width: 1.5, alpha: 0.65 })
    c.addChild(ring)
  }

  if (onHover) {
    c.eventMode = 'static'
    c.cursor = 'pointer'
    c.on('pointerover', (e) => onHover(shipmentId, e.global.x, e.global.y))
    c.on('pointermove', (e) => onHover(shipmentId, e.global.x, e.global.y))
    c.on('pointerout', () => onHover(null, 0, 0))
  }

  return c
}

// ── Path interpolation ────────────────────────────────────────────────────────

// Given a multi-segment screen-space path and a progress value (0–1), returns
// the interpolated {x, y, angle} position. Antimeridian "jumps" between
// sub-arrays are handled by snapping — the vehicle teleports to the other edge.
function interpolateAlongSegments(
  segments: [number, number][][],
  progress: number,
): { x: number; y: number; angle: number } | null {
  // Pre-compute per-edge lengths within each sub-array
  let totalLen = 0
  const edgeLens: number[][] = []
  for (const pts of segments) {
    const lens: number[] = []
    for (let i = 0; i + 1 < pts.length; i++) {
      const dx = pts[i + 1]![0] - pts[i]![0]
      const dy = pts[i + 1]![1] - pts[i]![1]
      const l = Math.sqrt(dx * dx + dy * dy)
      lens.push(l)
      totalLen += l
    }
    edgeLens.push(lens)
  }

  if (totalLen === 0) return null

  let remaining = Math.min(1, Math.max(0, progress)) * totalLen

  for (let si = 0; si < segments.length; si++) {
    const pts  = segments[si]!
    const lens = edgeLens[si]!
    for (let i = 0; i < lens.length; i++) {
      const len    = lens[i]!
      const isLast = si === segments.length - 1 && i === lens.length - 1
      if (remaining <= len || isLast) {
        const t  = len > 0 ? Math.min(1, remaining / len) : 1
        const x1 = pts[i]![0],  y1 = pts[i]![1]
        const x2 = pts[i + 1]![0], y2 = pts[i + 1]![1]
        const dx = x2 - x1, dy = y2 - y1
        return { x: x1 + dx * t, y: y1 + dy * t, angle: Math.atan2(dy, dx) }
      }
      remaining -= len
    }
  }

  // Fallback: snap to destination
  const last  = segments[segments.length - 1]!
  const lastPt = last[last.length - 1]!
  return { x: lastPt[0], y: lastPt[1], angle: 0 }
}

// ── Main draw function ────────────────────────────────────────────────────────

export function drawVehicles(
  layer: Container,
  shipments: ShipmentInTransit[],
  routes: Route[],
  cityMap: Map<string, ProjectedCity>,
  fleet: Vehicle[],
  displayProgress: Map<string, number>,
  waypoints: Record<string, [number, number][]>,
  projection: GeoProjection,
  onHover?: (shipmentId: string | null, x: number, y: number) => void,
): void {
  const pool = layerPools.get(layer)
  if (!pool) return

  const activeIds = new Set(shipments.map(s => s.id))

  for (const [id, container] of pool) {
    if (!activeIds.has(id)) {
      layer.removeChild(container)
      container.destroy({ children: true })
      pool.delete(id)
    }
  }

  for (const shipment of shipments) {
    const route = routes.find(r => r.id === shipment.routeId)
    if (!route) continue

    const vehicle  = fleet.find(v => v.id === shipment.vehicleId)
    const rawProgress = displayProgress.get(shipment.id) ?? 0
    const progress = shipment.reversed ? 1 - rawProgress : rawProgress

    const segs = getRouteSegments(route, cityMap, projection, waypoints)
    if (!segs.length) continue

    const pos = interpolateAlongSegments(segs, progress)
    if (!pos) continue

    const baseColor: number    = vehicle ? VEHICLE_COLOR[vehicle.type] : 0xffffff
    const vehicleType: VehicleType = vehicle?.type ?? 'truck'

    let vehicleContainer = pool.get(shipment.id)
    if (!vehicleContainer) {
      vehicleContainer = buildVehicleContainer(vehicleType, baseColor, shipment.isIllicit, shipment.id, onHover)
      layer.addChild(vehicleContainer)
      pool.set(shipment.id, vehicleContainer)
    }

    vehicleContainer.x        = pos.x
    vehicleContainer.y        = pos.y
    vehicleContainer.rotation = pos.angle
  }
}
