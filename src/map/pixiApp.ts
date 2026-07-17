import { Application, Container, Graphics } from 'pixi.js'
import type { GeoProjection } from 'd3-geo'
import { createProjection } from './projection'
import type { Viewport } from './projection'
import { buildCityLayer } from './cityLayer'
import type { CityLayerHandle } from './cityLayer'
import { buildRouteLayer, drawRoutes } from './routeLayer'
import type { VehicleFilter } from './routeLayer'
import { ALL_VEHICLES_VISIBLE } from './routeLayer'
import { buildVehicleLayer, drawVehicles } from './vehicleLayer'
import { buildThreatLayer, drawThreats } from './threatLayer'
import { buildWeatherLayer, drawWeatherClouds } from './weatherLayer'
import { buildExplosionLayer, tickExplosions } from './explosionLayer'
import type { ExplosionEntry } from './explosionLayer'
import { useGameStore } from '../store/gameStore'
import { DAY_MS } from '../engine/constants'
import { CONFIG } from '../engine/config'
import { ROUTE_VISUAL_WAYPOINTS } from '../data/routeWaypoints'

export interface MapCallbacks {
  onCityClick: (cityId: string) => void
  onCityHover?: (cityId: string | null) => void
  onStageClick: () => void
  onVehicleHover?: (shipmentId: string | null, x: number, y: number) => void
  onStormHover?: (eventId: string | null, x: number, y: number) => void
}

export interface PixiMapHandle {
  /** Update projection (called on pan/zoom). Does NOT rebuild containers — just repositions. */
  updateProjection: (projection: GeoProjection) => void
  /** Update vehicle filter — takes effect next frame */
  setVehicleFilter: (filter: VehicleFilter) => void
  cleanup: () => void
}

export async function initPixiApp(
  container: HTMLDivElement,
  viewport: Viewport,
  callbacks: MapCallbacks,
  gameTimeMsRef: React.MutableRefObject<number>,
): Promise<PixiMapHandle> {
  const width = Math.max(container.clientWidth, 100)
  const height = Math.max(container.clientHeight, 100)

  const app = new Application()
  await app.init({
    width,
    height,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })

  const canvas = app.canvas as HTMLCanvasElement
  canvas.style.cssText = 'display:block; position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:auto;'
  container.appendChild(canvas)

  let projection: GeoProjection = createProjection(width, height, viewport)

  // ── Route layer ────────────────────────────────────────────────────────────
  const routeGraphics: Graphics = buildRouteLayer()
  app.stage.addChild(routeGraphics)

  // ── Vehicle layer ──────────────────────────────────────────────────────────
  const vehicleLayer: Container = buildVehicleLayer()

  // ── Threat layer (Inspector + Interpol) ──────────────────────────────────
  const threatGraphics: Graphics = buildThreatLayer()

  // ── Weather cloud layer ───────────────────────────────────────────────────
  const weatherGraphics: Graphics = buildWeatherLayer()

  // ── Explosion layer (on top of everything) ────────────────────────────────
  const explosionLayer: Container = buildExplosionLayer()

  // ── City layer ─────────────────────────────────────────────────────────────
  let cityHandle: CityLayerHandle = buildCityLayer(
    projection,
    callbacks.onCityClick,
    callbacks.onCityHover,
  )
  app.stage.addChild(cityHandle.container)
  app.stage.addChild(vehicleLayer)
  app.stage.addChild(threatGraphics)
  app.stage.addChild(weatherGraphics)
  app.stage.addChild(explosionLayer)

  // ── Stage (deselect on click) ──────────────────────────────────────────────
  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen
  app.stage.on('pointerdown', callbacks.onStageClick)

  // ── Animation state ────────────────────────────────────────────────────────
  let dashOffset = 0
  let pulseTimer = 0
  let activeExplosions: ExplosionEntry[] = []
  let prevAlertIds = new Set(useGameStore.getState().threatAlerts.map(a => a.id))
  let currentRoutes = useGameStore.getState().gameState.routes
  let currentShipments = useGameStore.getState().gameState.shipmentsInTransit
  let currentFleet = useGameStore.getState().gameState.fleet
  let currentInspectorCity       = useGameStore.getState().gameState.inspector.currentCityId
  let currentInspectorProbNext   = useGameStore.getState().gameState.inspector.probableNextCityId
  let currentInterpolCity        = useGameStore.getState().gameState.interpol.currentCityId
  let currentInterpolProbNext    = useGameStore.getState().gameState.interpol.probableNextCityId
  let currentInterpolAdditional  = useGameStore.getState().gameState.interpol.additionalCityIds
  let currentWeatherEvents = useGameStore.getState().gameState.weatherEvents
  let currentUnlockedSkills = useGameStore.getState().gameState.unlockedSkills
  let currentFilter: VehicleFilter = ALL_VEHICLES_VISIBLE

  // ── Storm proximity tracking ───────────────────────────────────────────────
  let currentStormPositions: { eventId: string; x: number; y: number }[] = []
  let lastHoveredStormId: string | null = null
  let lastHoveredVehicleId: string | null = null

  function updateStormPositions() {
    currentStormPositions = []
    const seen = new Set<string>()
    for (const event of currentWeatherEvents) {
      for (const routeId of event.affectedRouteIds) {
        const route = currentRoutes.find(r => r.id === routeId)
        if (!route) continue
        const origin = cityHandle.cityMap.get(route.origin)
        const dest = cityHandle.cityMap.get(route.destination)
        if (!origin || !dest) continue
        const key = `${Math.round((origin.px + dest.px) / 2)}_${Math.round((origin.py + dest.py) / 2)}`
        if (seen.has(key)) continue
        seen.add(key)
        currentStormPositions.push({
          eventId: event.id,
          x: (origin.px + dest.px) / 2,
          y: (origin.py + dest.py) / 2,
        })
      }
    }
  }

  // ── Storm proximity hover ─────────────────────────────────────────────────
  app.stage.on('pointermove', (e: { global: { x: number; y: number } }) => {
    const { x, y } = e.global
    let nearest: string | null = null
    for (const sp of currentStormPositions) {
      if (Math.hypot(sp.x - x, sp.y - y) < 28) {
        nearest = sp.eventId
        break
      }
    }
    if (nearest !== lastHoveredStormId) {
      lastHoveredStormId = nearest
      callbacks.onStormHover?.(nearest, x, y)
    }
  })

  // ── Animation ticker ───────────────────────────────────────────────────────
  app.ticker.add((ticker) => {
    dashOffset += ticker.deltaMS * 0.015
    pulseTimer += ticker.deltaMS

    const now = gameTimeMsRef.current

    // Compute continuous shipment progress from real time
    const skillSpeedMult = currentUnlockedSkills.includes('logistics_2')
      ? CONFIG.skills.effects.logistics_2.transitTimeMultiplier
      : 1.0
    const eu = CONFIG.vehicleUpgrades.effects.engine
    const progressMap = new Map<string, number>()
    for (const s of currentShipments) {
      const engineTier = currentFleet.find(v => v.id === s.vehicleId)?.upgrades.engine ?? 0
      const engineMult = engineTier === 2 ? eu.tier2TransitMultiplier : engineTier === 1 ? eu.tier1TransitMultiplier : 1.0
      const arrivalTime = s.departureTimeMs + s.totalTurns * DAY_MS * skillSpeedMult * engineMult + s.frozenDurationMs
      const duration = arrivalTime - s.departureTimeMs

      // Find the active (non-forecast) storm blocking this route, if any
      const blockingStorm = currentWeatherEvents.find(e => !e.isForecast && e.affectedRouteIds.includes(s.routeId))

      let progress: number
      if (blockingStorm) {
        // Freeze the vehicle at its exact position when the storm became active
        const stormActiveSinceMs = blockingStorm.clearAtMs != null
          ? blockingStorm.clearAtMs - DAY_MS * CONFIG.weather.activeDurationDays
          : now
        const freezeStart = Math.max(s.departureTimeMs, stormActiveSinceMs)
        // Progress at freeze time (exclude any frozenDurationMs already accumulated)
        progress = duration > 0
          ? Math.min(0.98, Math.max(0, (freezeStart - s.departureTimeMs) / duration))
          : 0.98
      } else {
        progress = duration > 0
          ? Math.min(1, Math.max(0, (now - s.departureTimeMs) / duration))
          : 1
      }
      progressMap.set(s.id, progress)
    }

    const pulse = (Math.sin(pulseTimer * 0.002) + 1) / 2
    updateStormPositions()
    drawRoutes(routeGraphics, currentRoutes, cityHandle.cityMap, projection, dashOffset, currentFilter, currentWeatherEvents, ROUTE_VISUAL_WAYPOINTS)
    drawVehicles(vehicleLayer, currentShipments, currentRoutes, cityHandle.cityMap, currentFleet, progressMap, ROUTE_VISUAL_WAYPOINTS, projection, (id, x, y) => {
      if (id !== lastHoveredVehicleId) {
        lastHoveredVehicleId = id
        callbacks.onVehicleHover?.(id, x, y)
      } else if (id !== null) {
        callbacks.onVehicleHover?.(id, x, y) // update position
      }
    })
    const showProbableNext = currentUnlockedSkills.includes('network_2') || useGameStore.getState().gameState.inspector.isTrackedByInformant
    const interpolAdjacentCities = currentInterpolCity
      ? [...new Set(
          currentRoutes
            .filter(r => r.status === 'open' &&
              (r.tier === 'international' || r.tier === 'long_haul') &&
              (r.origin === currentInterpolCity || r.destination === currentInterpolCity))
            .flatMap(r => [r.origin, r.destination])
            .filter(c => c !== currentInterpolCity),
        )]
      : []
    drawThreats(threatGraphics, currentInspectorCity, currentInterpolCity, cityHandle.cityMap, pulse, currentInspectorProbNext, currentInterpolProbNext, showProbableNext, interpolAdjacentCities, currentInterpolAdditional)
    drawWeatherClouds(weatherGraphics, currentWeatherEvents, currentRoutes, cityHandle.cityMap, pulse, pulseTimer)
    activeExplosions = tickExplosions(explosionLayer, activeExplosions, cityHandle.cityMap, performance.now())
  })

  const unsubscribeStore = useGameStore.subscribe((state) => {
    currentRoutes = state.gameState.routes
    currentShipments = state.gameState.shipmentsInTransit
    currentFleet = state.gameState.fleet
    currentInspectorCity     = state.gameState.inspector.currentCityId
    currentInspectorProbNext = state.gameState.inspector.probableNextCityId
    currentInterpolCity      = state.gameState.interpol.currentCityId
    currentInterpolProbNext  = state.gameState.interpol.probableNextCityId
    currentInterpolAdditional = state.gameState.interpol.additionalCityIds
    currentWeatherEvents = state.gameState.weatherEvents
    currentUnlockedSkills = state.gameState.unlockedSkills
    updateStormPositions()
    cityHandle.updateInventoryBadges(state.gameState.cityInventory)

    // Fire explosion for each newly created threat alert that has a known city
    for (const alert of state.threatAlerts) {
      if (!prevAlertIds.has(alert.id) && alert.cityId !== null) {
        activeExplosions.push({ cityId: alert.cityId, startMs: performance.now(), reason: alert.reason })
      }
    }
    prevAlertIds = new Set(state.threatAlerts.map(a => a.id))
  })

  // ── Resize ────────────────────────────────────────────────────────────────
  const resizeObserver = new ResizeObserver(() => {
    const w = Math.max(container.clientWidth, 100)
    const h = Math.max(container.clientHeight, 100)
    app.renderer.resize(w, h)
    app.stage.hitArea = app.screen
  })
  resizeObserver.observe(container)

  return {
    updateProjection(newProjection: GeoProjection) {
      projection = newProjection
      cityHandle.updatePositions(newProjection)
    },

    setVehicleFilter(filter: VehicleFilter) {
      currentFilter = filter
    },

    cleanup() {
      unsubscribeStore()
      resizeObserver.disconnect()
      canvas.remove()
      app.destroy()
    },
  }
}
