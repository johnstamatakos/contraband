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
import { buildInvestigatorLayer, drawInvestigator } from './investigatorLayer'
import { buildWeatherLayer, drawWeatherClouds } from './weatherLayer'
import { useGameStore } from '../store/gameStore'
import { WEEK_MS, DAY_MS } from '../engine/constants'

export interface MapCallbacks {
  onCityClick: (cityId: string) => void
  onCityHover?: (cityId: string | null) => void
  onStageClick: () => void
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

  // ── Investigator layer ────────────────────────────────────────────────────
  const investigatorGraphics: Graphics = buildInvestigatorLayer()

  // ── Weather cloud layer ───────────────────────────────────────────────────
  const weatherGraphics: Graphics = buildWeatherLayer()

  // ── City layer ─────────────────────────────────────────────────────────────
  let cityHandle: CityLayerHandle = buildCityLayer(
    projection,
    callbacks.onCityClick,
    callbacks.onCityHover,
  )
  app.stage.addChild(cityHandle.container)
  app.stage.addChild(vehicleLayer)
  app.stage.addChild(investigatorGraphics)
  app.stage.addChild(weatherGraphics)

  // ── Stage (deselect on click) ──────────────────────────────────────────────
  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen
  app.stage.on('pointerdown', callbacks.onStageClick)

  // ── Animation state ────────────────────────────────────────────────────────
  let dashOffset = 0
  let pulseTimer = 0
  let currentRoutes = useGameStore.getState().gameState.routes
  let currentShipments = useGameStore.getState().gameState.shipmentsInTransit
  let currentFleet = useGameStore.getState().gameState.fleet
  let currentInvestigatorCity = useGameStore.getState().gameState.investigator.currentCityId
  let currentWeatherEvents = useGameStore.getState().gameState.weatherEvents
  let currentFilter: VehicleFilter = ALL_VEHICLES_VISIBLE

  // ── Animation ticker ───────────────────────────────────────────────────────
  app.ticker.add((ticker) => {
    dashOffset += ticker.deltaMS * 0.015
    pulseTimer += ticker.deltaMS

    const now = gameTimeMsRef.current

    // Compute continuous shipment progress from real time
    const progressMap = new Map<string, number>()
    for (const s of currentShipments) {
      const arrivalTime = s.departureTimeMs + s.totalTurns * DAY_MS + s.frozenDurationMs
      // Freeze visual progress when route has active weather
      const isFrozen = currentWeatherEvents.some(e => !e.isForecast && e.affectedRouteIds.includes(s.routeId))
      const duration = arrivalTime - s.departureTimeMs
      const rawProgress = duration > 0
        ? Math.min(1, Math.max(0, (now - s.departureTimeMs) / duration))
        : 1
      // Cap at 0.95 while frozen so the vehicle visibly stalls before the destination
      progressMap.set(s.id, isFrozen ? Math.min(rawProgress, 0.95) : rawProgress)
    }

    const pulse = (Math.sin(pulseTimer * 0.002) + 1) / 2
    drawRoutes(routeGraphics, currentRoutes, cityHandle.cityMap, projection, dashOffset, currentFilter, currentWeatherEvents)
    drawVehicles(vehicleLayer, currentShipments, currentRoutes, cityHandle.cityMap, currentFleet, progressMap)
    drawInvestigator(investigatorGraphics, currentInvestigatorCity, cityHandle.cityMap, pulse)
    drawWeatherClouds(weatherGraphics, currentWeatherEvents, currentRoutes, cityHandle.cityMap, pulse, pulseTimer)
  })

  const unsubscribeStore = useGameStore.subscribe((state) => {
    currentRoutes = state.gameState.routes
    currentShipments = state.gameState.shipmentsInTransit
    currentFleet = state.gameState.fleet
    currentInvestigatorCity = state.gameState.investigator.currentCityId
    currentWeatherEvents = state.gameState.weatherEvents
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
