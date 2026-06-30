import { Graphics } from 'pixi.js'
import type { WeatherEvent, Route } from '../engine/gameState'
import type { ProjectedCity } from './cityLayer'

export function buildWeatherLayer(): Graphics {
  const g = new Graphics()
  g.label = 'weatherLayer'
  return g
}

/**
 * Draw an animated storm cloud at the midpoint of each weather-affected route.
 * pulse: 0–1 oscillating value from ticker (used for bobbing and opacity)
 * time: monotonically increasing ms for secondary animation
 */
export function drawWeatherClouds(
  g: Graphics,
  weatherEvents: WeatherEvent[],
  routes: Route[],
  cityMap: Map<string, ProjectedCity>,
  pulse: number,
  time: number,
): void {
  g.clear()
  if (weatherEvents.length === 0) return

  const drawnMidpoints = new Set<string>() // avoid double-drawing overlapping routes

  for (const event of weatherEvents) {
    const isForecast = event.isForecast
    const alpha = isForecast ? 0.35 : 0.85

    for (const routeId of event.affectedRouteIds) {
      const route = routes.find(r => r.id === routeId)
      if (!route) continue

      const origin = cityMap.get(route.origin)
      const dest = cityMap.get(route.destination)
      if (!origin || !dest) continue

      // Midpoint
      const mx = (origin.px + dest.px) / 2
      const my = (origin.py + dest.py) / 2

      const midKey = `${Math.round(mx)}_${Math.round(my)}`
      if (drawnMidpoints.has(midKey)) continue
      drawnMidpoints.add(midKey)

      // Gentle vertical bob: ±3px over ~3 seconds
      const bob = Math.sin(time * 0.0008 + mx * 0.01) * 3
      const cx = mx
      const cy = my + bob

      // Scale pulses slightly
      const scale = 1 + pulse * 0.08

      drawCloud(g, cx, cy, scale, alpha, event.type)
    }
  }
}

function drawCloud(
  g: Graphics,
  cx: number,
  cy: number,
  scale: number,
  alpha: number,
  weatherType: string,
): void {
  const isSevere = weatherType === 'hurricane' || weatherType === 'typhoon'
  const isSnow = weatherType === 'blizzard'

  const cloudColor = isSnow ? 0xe2e8f0 : isSevere ? 0x93c5fd : 0x7dd3fc
  const glowColor = isSevere ? 0x3b82f6 : 0x38bdf8

  const s = scale

  // Soft glow behind cloud
  g.circle(cx, cy - 1 * s, 13 * s)
  g.fill({ color: glowColor, alpha: alpha * 0.18 })

  // Cloud body: overlapping circles
  g.circle(cx, cy, 7 * s)
  g.circle(cx - 6 * s, cy + 2 * s, 5 * s)
  g.circle(cx + 6 * s, cy + 2 * s, 5 * s)
  g.circle(cx - 3 * s, cy - 4 * s, 4.5 * s)
  g.circle(cx + 3 * s, cy - 4 * s, 4.5 * s)
  g.fill({ color: cloudColor, alpha })

  if (isSevere) {
    // Larger, darker cloud for hurricane/typhoon
    g.circle(cx, cy, 9 * s)
    g.circle(cx - 7 * s, cy + 2 * s, 6 * s)
    g.circle(cx + 7 * s, cy + 2 * s, 6 * s)
    g.fill({ color: 0x60a5fa, alpha: alpha * 0.5 })
  }

  // Lightning bolt for thunderstorm / hurricane
  if (weatherType === 'thunderstorm' || isSevere) {
    const bx = cx + 1 * s
    const by = cy + 7 * s
    g.poly([
      bx, by,
      bx - 3 * s, by + 5 * s,
      bx + 1 * s, by + 5 * s,
      bx - 2 * s, by + 11 * s,
      bx + 4 * s, by + 4 * s,
      bx + 1 * s, by + 4 * s,
    ])
    g.fill({ color: 0xfbbf24, alpha: alpha * 0.9 })
  }

  // Snowflake dots for blizzard
  if (isSnow) {
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2
      const r = 8 * s
      g.circle(cx + Math.cos(angle) * r, cy + 9 * s + Math.sin(angle) * 2, 1.5 * s)
    }
    g.fill({ color: 0xffffff, alpha: alpha * 0.8 })
  }

  // Rain lines for other types
  if (!isSnow && weatherType !== 'thunderstorm' && !isSevere) {
    for (let i = -1; i <= 1; i++) {
      g.moveTo(cx + i * 4 * s, cy + 8 * s)
      g.lineTo(cx + i * 4 * s - 1 * s, cy + 13 * s)
    }
    g.stroke({ color: cloudColor, width: 1.5 * s, alpha: alpha * 0.7 })
  }

  // Turn countdown badge
  // (shown as a small number — omitted for now to keep visual clean)
}
