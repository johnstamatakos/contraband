import { Graphics } from 'pixi.js'
import type { ProjectedCity } from './cityLayer'

export function buildThreatLayer(): Graphics {
  const g = new Graphics()
  g.label = 'threatLayer'
  return g
}

/**
 * Draw threat entities on the map.
 *
 * Inspector (red)  — domestic/regional routes.
 * Interpol (blue)  — international/long_haul routes.
 *   Adjacent cities (faint blue rings) — cities 1 hop from Interpol on the intl graph.
 *
 * pulse: 0–1 oscillating value (e.g. from Math.sin).
 */
export function drawThreats(
  g: Graphics,
  inspectorCityId: string | null,
  interpolCityId: string | null,
  cityMap: Map<string, ProjectedCity>,
  pulse: number,
  inspectorProbableNext: string | null = null,
  interpolProbableNext: string | null = null,
  showProbableNext: boolean = false,
  interpolAdjacentCities: string[] = [],
  interpolAdditionalCityIds: string[] = [],
): void {
  g.clear()

  // ── Interpol adjacent cities — faint rings drawn first (behind main ring) ──
  for (const cityId of interpolAdjacentCities) {
    if (cityId === interpolCityId) continue  // already drawn as main ring
    if (interpolAdditionalCityIds.includes(cityId)) continue  // drawn below
    const c = cityMap.get(cityId)
    if (!c) continue
    const r = 7 + pulse * 2
    const a = 0.18 + pulse * 0.12
    g.circle(c.px, c.py, r)
    g.stroke({ color: 0x3b82f6, width: 1.5, alpha: a })
  }

  // ── Interpol additional positions — slightly smaller blue rings ─────────────
  for (const cityId of interpolAdditionalCityIds) {
    if (cityId === interpolCityId) continue
    const city = cityMap.get(cityId)
    if (!city) continue
    const radius = 10 + pulse * 3
    const alpha  = 0.70 - pulse * 0.25
    g.circle(city.px, city.py, radius)
    g.stroke({ color: 0x3b82f6, width: 2, alpha })
    g.circle(city.px, city.py, 3.5)
    g.fill({ color: 0x3b82f6, alpha: 0.75 })
  }

  // ── Inspector — red ────────────────────────────────────────────────────────
  if (inspectorCityId) {
    const city = cityMap.get(inspectorCityId)
    if (city) {
      const radius = 11 + pulse * 4
      const alpha  = 0.85 - pulse * 0.35
      g.circle(city.px, city.py, radius)
      g.stroke({ color: 0xef4444, width: 2.5, alpha })
      g.circle(city.px, city.py, 4)
      g.fill({ color: 0xef4444, alpha: 0.9 })

      if (showProbableNext && inspectorProbableNext) {
        const nc = cityMap.get(inspectorProbableNext)
        if (nc) {
          const nr = 9 + pulse * 3
          const na = 0.30 + pulse * 0.20
          g.circle(nc.px, nc.py, nr)
          g.stroke({ color: 0xf59e0b, width: 1.5, alpha: na })
          g.circle(nc.px, nc.py, 2.5)
          g.fill({ color: 0xf59e0b, alpha: na + 0.1 })
        }
      }
    }
  }

  // ── Interpol primary — blue (larger ring) ──────────────────────────────────
  if (interpolCityId) {
    const city = cityMap.get(interpolCityId)
    if (city) {
      const radius = 13 + pulse * 5
      const alpha  = 0.85 - pulse * 0.35
      g.circle(city.px, city.py, radius)
      g.stroke({ color: 0x3b82f6, width: 2.5, alpha })
      g.circle(city.px, city.py, 5)
      g.fill({ color: 0x3b82f6, alpha: 0.9 })

      if (showProbableNext && interpolProbableNext) {
        const nc = cityMap.get(interpolProbableNext)
        if (nc) {
          const nr = 9 + pulse * 3
          const na = 0.30 + pulse * 0.20
          g.circle(nc.px, nc.py, nr)
          g.stroke({ color: 0x60a5fa, width: 1.5, alpha: na })
          g.circle(nc.px, nc.py, 2.5)
          g.fill({ color: 0x60a5fa, alpha: na + 0.1 })
        }
      }
    }
  }
}
