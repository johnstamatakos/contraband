import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { GeoProjection } from 'd3-geo'
import type { City } from '../engine/gameState'
import { CITIES } from '../data/cities'
import { projectCoord } from './projection'

export interface ProjectedCity extends City {
  px: number
  py: number
}

const TIER_RADIUS: Record<City['tier'], number> = {
  major_hub: 6,
  regional: 4,
  minor: 3,
}
const TIER_COLOR: Record<City['tier'], number> = {
  major_hub: 0x60a5fa,
  regional: 0x93c5fd,
  minor: 0xbfdbfe,
}
const HIT_RADIUS = 14

export interface CityLayerHandle {
  container: Container
  projectedCities: ProjectedCity[]
  cityMap: Map<string, ProjectedCity>
  // Call this instead of rebuilding from scratch when projection changes
  updatePositions: (projection: GeoProjection) => void
  // Show/hide inventory badges based on per-city inventory
  updateInventoryBadges: (cityInventory: Record<string, Record<string, number>>) => void
  // Trigger a delivery flash animation on a city
  triggerDeliveryFlash: (cityId: string) => void
  // Tick flash animations (call every frame)
  tickFlashes: (nowMs: number) => void
}

export function buildCityLayer(
  projection: GeoProjection,
  onCityClick: (cityId: string) => void,
  onCityHover?: (cityId: string | null) => void,
): CityLayerHandle {
  const container = new Container()
  container.label = 'cityLayer'

  let projectedCities: ProjectedCity[] = []
  let cityMap: Map<string, ProjectedCity> = new Map()

  // Stable references to each city node (index matches CITIES order)
  const cityNodes: Container[] = []
  // Inventory badge graphics per city (index matches CITIES order)
  const inventoryBadges: Graphics[] = []
  // Active delivery flashes per city index
  const cityFlashStates: Array<{ startMs: number; color: number } | null> = new Array(CITIES.length).fill(null)
  // Flash ring graphics per city (separate from dot, drawn on top)
  const flashRings: Graphics[] = []

  for (const city of CITIES) {
    const coord = projectCoord(projection, city.lon, city.lat)
    const px = coord ? coord[0] : 0
    const py = coord ? coord[1] : 0

    if (coord) {
      projectedCities.push({ ...city, px, py })
    }

    const cityNode = new Container()
    cityNode.x = px
    cityNode.y = py
    cityNode.eventMode = 'static'
    cityNode.cursor = 'pointer'

    // Transparent hit zone (larger than visual)
    const hit = new Graphics()
    hit.circle(0, 0, HIT_RADIUS)
    hit.fill({ color: 0xffffff, alpha: 0 })
    cityNode.addChild(hit)

    // Glow ring
    const glow = new Graphics()
    const r = TIER_RADIUS[city.tier]
    glow.circle(0, 0, r + 2)
    glow.stroke({ color: TIER_COLOR[city.tier], width: 1, alpha: 0.35 })
    cityNode.addChild(glow)

    // Dot
    const dot = new Graphics()
    dot.circle(0, 0, r)
    dot.fill(TIER_COLOR[city.tier])
    cityNode.addChild(dot)

    // Label (major + regional hubs only)
    if (city.tier !== 'minor') {
      const style = new TextStyle({
        fontFamily: 'monospace',
        fontSize: city.tier === 'major_hub' ? 10 : 9,
        fill: city.tier === 'major_hub' ? 0xd1d5db : 0x9ca3af,
        letterSpacing: 0.5,
      })
      const label = new Text({ text: city.name, style })
      const dotR = TIER_RADIUS[city.tier]
      label.x = dotR + 4
      label.y = -(label.height / 2)
      cityNode.addChild(label)
    }

    // Inventory badge — small amber diamond, positioned above the city dot
    const badge = new Graphics()
    const badgeSize = 3
    badge.rect(-badgeSize, -badgeSize, badgeSize * 2, badgeSize * 2)
    badge.fill(0xf59e0b) // amber-500
    badge.stroke({ color: 0x92400e, width: 0.5 }) // amber-900 border
    badge.x = 0
    badge.y = -(TIER_RADIUS[city.tier] + 7)
    badge.rotation = Math.PI / 4 // rotate 45° for diamond shape
    badge.visible = false
    cityNode.addChild(badge)
    inventoryBadges.push(badge)

    // Flash ring — drawn on top, animated on delivery
    const flashRing = new Graphics()
    flashRing.visible = false
    cityNode.addChild(flashRing)
    flashRings.push(flashRing)

    cityNode.on('pointerdown', (e) => {
      e.stopPropagation()
      onCityClick(city.id)
    })
    if (onCityHover) {
      cityNode.on('pointerover', () => onCityHover(city.id))
      cityNode.on('pointerout', () => onCityHover(null))
    }

    cityNodes.push(cityNode)
    container.addChild(cityNode)
  }

  cityMap = new Map(projectedCities.map(c => [c.id, c]))

  // ── Update positions without rebuilding containers ──────────────────────
  function updatePositions(newProjection: GeoProjection): void {
    projectedCities = []
    for (let i = 0; i < CITIES.length; i++) {
      const city = CITIES[i]!
      const coord = projectCoord(newProjection, city.lon, city.lat)
      if (coord) {
        cityNodes[i]!.x = coord[0]
        cityNodes[i]!.y = coord[1]
        projectedCities.push({ ...city, px: coord[0], py: coord[1] })
      }
    }
    cityMap = new Map(projectedCities.map(c => [c.id, c]))
  }

  // ── Show/hide inventory badges based on per-city inventory ──────────────
  function updateInventoryBadges(cityInventory: Record<string, Record<string, number>>): void {
    for (let i = 0; i < CITIES.length; i++) {
      const city = CITIES[i]!
      const stock = cityInventory[city.id]
      const hasStock = stock != null && Object.values(stock).some(qty => qty > 0)
      inventoryBadges[i]!.visible = hasStock
    }
  }

  // ── Trigger a delivery flash on a city ───────────────────────────────────
  function triggerDeliveryFlash(cityId: string): void {
    const idx = CITIES.findIndex(c => c.id === cityId)
    if (idx === -1) return
    cityFlashStates[idx] = { startMs: performance.now(), color: 0x34d399 } // emerald
  }

  // ── Tick flash animations ─────────────────────────────────────────────────
  function tickFlashes(nowMs: number): void {
    const FLASH_DURATION = 700
    for (let i = 0; i < CITIES.length; i++) {
      const fs = cityFlashStates[i]
      const ring = flashRings[i]!
      if (!fs) {
        ring.visible = false
        continue
      }
      const t = (nowMs - fs.startMs) / FLASH_DURATION
      if (t >= 1) {
        cityFlashStates[i] = null
        ring.visible = false
        continue
      }
      // Ease: expand and fade
      const scale = 1 + t * 3.5
      const alpha = 1 - t
      const city = CITIES[i]!
      const r = TIER_RADIUS[city.tier]
      ring.clear()
      ring.circle(0, 0, r * scale)
      ring.stroke({ color: fs.color, width: 1.5, alpha })
      ring.visible = true
    }
  }

  // Use getters so callers always read the live values after updatePositions()
  return {
    container,
    get projectedCities() { return projectedCities },
    get cityMap() { return cityMap },
    updatePositions,
    updateInventoryBadges,
    triggerDeliveryFlash,
    tickFlashes,
  }
}
