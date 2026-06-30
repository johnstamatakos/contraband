import { Graphics } from 'pixi.js'
import type { ProjectedCity } from './cityLayer'

export function buildInvestigatorLayer(): Graphics {
  const g = new Graphics()
  g.label = 'investigatorLayer'
  return g
}

/**
 * Draw a pulsing red ring at the investigator's current city.
 * pulse: 0–1 oscillating value (e.g. from Math.sin).
 */
export function drawInvestigator(
  g: Graphics,
  investigatorCityId: string | null,
  cityMap: Map<string, ProjectedCity>,
  pulse: number,
): void {
  g.clear()
  if (!investigatorCityId) return
  const city = cityMap.get(investigatorCityId)
  if (!city) return

  const radius = 11 + pulse * 4
  const alpha = 0.85 - pulse * 0.35

  // Outer pulsing ring
  g.circle(city.px, city.py, radius)
  g.stroke({ color: 0xef4444, width: 2.5, alpha })

  // Inner filled dot
  g.circle(city.px, city.py, 4)
  g.fill({ color: 0xef4444, alpha: 0.9 })
}
