import { useRef, useEffect, useState, useCallback } from 'react'
import { createProjection, zoomViewport, DEFAULT_VIEWPORT } from './projection'
import type { Viewport } from './projection'
import { drawWorldToCanvas } from './worldCanvas'
import { initPixiApp } from './pixiApp'
import type { PixiMapHandle } from './pixiApp'
import type { VehicleFilter } from './routeLayer'
import { RoutePanel } from '../ui/RoutePanel'
import type { VehicleType } from '../engine/gameState'
import { VEHICLE_ICON, VEHICLE_LABEL } from '../ui/vehicleConstants'
import { useGameStore } from '../store/gameStore'
import { CITY_MAP } from '../data/cities'

type HoverInfo = { type: 'vehicle'; id: string; x: number; y: number } | { type: 'storm'; id: string; x: number; y: number } | null

function MapTooltip({ info }: { info: { type: string; id: string; x: number; y: number } }) {
  const { gameState } = useGameStore()

  let content: React.ReactNode = null

  if (info.type === 'vehicle') {
    const shipment = gameState.shipmentsInTransit.find(s => s.id === info.id)
    const vehicle = shipment ? gameState.fleet.find(v => v.id === shipment.vehicleId) : null
    const contract = shipment ? gameState.contracts.find(c => c.id === shipment.contractId) : null
    if (!shipment || !vehicle || !contract) return null

    const originName = CITY_MAP.get(contract.origin)?.name ?? contract.origin
    const destName = CITY_MAP.get(contract.destination)?.name ?? contract.destination
    const activeUpgrades = (['cargo', 'engine', 'concealment'] as const).filter(u => vehicle.upgrades[u] > 0)

    content = (
      <div>
        <div className="font-semibold text-white mb-1">{vehicle.name}</div>
        <div className="text-gray-400">{originName} → {destName}</div>
        <div className="text-gray-500">{contract.cargoType} · {contract.volume} units</div>
        <div className="flex items-center justify-between mt-1.5">
          <span className={`text-xs ${contract.isIllicit ? 'text-red-400' : 'text-gray-600'}`}>
            {contract.isIllicit ? 'ILLICIT' : 'LEGIT'}
          </span>
          <span className="text-emerald-400 font-semibold">
            +${contract.payout.toLocaleString()}{contract.isRecurring ? '/run' : ''}
          </span>
        </div>
        {activeUpgrades.length > 0 && (
          <div className="flex gap-1 mt-1">
            {activeUpgrades.map(u => (
              <span key={u} className="text-xs px-1 py-0.5 rounded bg-gray-700 text-gray-300">
                {u === 'cargo' ? 'HOLD' : u === 'engine' ? 'ENG' : 'HIDE'} T{vehicle.upgrades[u]}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  } else if (info.type === 'storm') {
    const event = gameState.weatherEvents.find(e => e.id === info.id)
    if (!event) return null

    const typeLabel: Record<string, string> = {
      thunderstorm: 'Thunderstorm',
      hurricane: 'Hurricane',
      typhoon: 'Typhoon',
      port_fog: 'Port Fog',
      blizzard: 'Blizzard',
      monsoon: 'Monsoon',
    }

    content = (
      <div>
        <div className="font-semibold text-white mb-1">{typeLabel[event.type] ?? event.type}</div>
        <div className={event.isForecast ? 'text-yellow-400' : 'text-red-400'}>
          {event.isForecast ? 'Incoming' : 'Active'}
        </div>
        <div className="text-gray-500">{event.turnsRemaining} week{event.turnsRemaining !== 1 ? 's' : ''} remaining</div>
        <div className="text-gray-600 mt-1">Affects {event.affectedRouteIds.length} route{event.affectedRouteIds.length !== 1 ? 's' : ''}</div>
      </div>
    )
  }

  if (!content) return null

  return (
    <div
      className="absolute z-20 pointer-events-none bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-xs font-mono shadow-xl max-w-48"
      style={{ left: info.x + 14, top: info.y + 14 }}
    >
      {content}
    </div>
  )
}

interface MapViewProps {
  gameTimeMsRef: React.MutableRefObject<number>
}

export function MapView({ gameTimeMsRef }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const worldCanvasRef = useRef<HTMLCanvasElement>(null)
  const pixiRef = useRef<PixiMapHandle | null>(null)
  const viewportRef = useRef<Viewport>(DEFAULT_VIEWPORT)
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>({ truck: true, plane: true, ship: true })
  const [hoveredInfo, setHoveredInfo] = useState<HoverInfo>(null)

  // ── Shared redraw: world canvas + pixi projection ─────────────────────────
  const redraw = useCallback((vp: Viewport) => {
    const canvas = worldCanvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const w = container.clientWidth
    const h = container.clientHeight
    if (w <= 0 || h <= 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    // Projection uses CSS pixels; the canvas ctx is scaled by DPR inside drawWorldToCanvas
    const proj = createProjection(w, h, vp)
    drawWorldToCanvas(canvas, proj)

    if (pixiRef.current) {
      pixiRef.current.updateProjection(proj)
    }
  }, [])

  // ── World canvas (initial render + resize) ────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    redraw(viewportRef.current)

    const ro = new ResizeObserver(() => redraw(viewportRef.current))
    ro.observe(container)
    return () => ro.disconnect()
  }, [redraw])

  // ── Pixi app ───────────────────────────────────────────────────────────────
  const handleCityClick = useCallback((cityId: string) => {
    setSelectedCityId(prev => (prev === cityId ? null : cityId))
  }, [])
  const handleStageClick = useCallback(() => setSelectedCityId(null), [])

  const handleVehicleHover = useCallback((shipmentId: string | null, x: number, y: number) => {
    setHoveredInfo(shipmentId ? { type: 'vehicle', id: shipmentId, x, y } : null)
  }, [])

  const handleStormHover = useCallback((eventId: string | null, x: number, y: number) => {
    setHoveredInfo(eventId ? { type: 'storm', id: eventId, x, y } : null)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false

    initPixiApp(container, viewportRef.current, {
      onCityClick: handleCityClick,
      onStageClick: handleStageClick,
      onVehicleHover: handleVehicleHover,
      onStormHover: handleStormHover,
    }, gameTimeMsRef).then((handle) => {
      if (cancelled) { handle.cleanup(); return }
      pixiRef.current = handle
    }).catch(console.error)

    return () => {
      cancelled = true
      pixiRef.current?.cleanup()
      pixiRef.current = null
    }
  }, [handleCityClick, handleStageClick, handleVehicleHover, handleStormHover])

  // Sync vehicle filter to pixi
  useEffect(() => {
    pixiRef.current?.setVehicleFilter(vehicleFilter)
  }, [vehicleFilter])

  // ── Zoom (mouse wheel) ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const newVp = zoomViewport(viewportRef.current, factor, sx, sy, el.clientWidth, el.clientHeight)
      viewportRef.current = newVp
      redraw(newVp)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [redraw])

  // ── Pan (mouse drag) ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onMouseDown = (e: MouseEvent) => {
      // Only drag on middle button or when no city click is imminent
      // Left button drag — check that we're not clicking a city (Pixi handles that)
      if (e.button !== 0 && e.button !== 1) return
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panX: viewportRef.current.panX,
        panY: viewportRef.current.panY,
      }
      el.style.cursor = 'grabbing'
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      // Only start panning after moving >4px (prevents triggering pan on city clicks)
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
      const newVp: Viewport = {
        ...viewportRef.current,
        panX: dragRef.current.panX + dx,
        panY: dragRef.current.panY + dy,
      }
      viewportRef.current = newVp
      redraw(newVp)
    }

    const onMouseUp = () => {
      dragRef.current = null
      el.style.cursor = ''
    }

    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [redraw])

  // ── Zoom buttons ───────────────────────────────────────────────────────────
  const zoomBy = useCallback((factor: number) => {
    const el = containerRef.current
    if (!el) return
    const cx = el.clientWidth / 2
    const cy = el.clientHeight / 2
    const newVp = zoomViewport(viewportRef.current, factor, cx, cy, el.clientWidth, el.clientHeight)
    viewportRef.current = newVp
    redraw(newVp)
  }, [redraw])

  // ── Toggle a vehicle filter ────────────────────────────────────────────────
  const toggleVehicle = (v: VehicleType) => {
    setVehicleFilter(prev => {
      const next = { ...prev, [v]: !prev[v] }
      // Always keep at least one enabled
      const anyOn = Object.values(next).some(Boolean)
      return anyOn ? next : prev
    })
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden select-none"
      style={{ background: '#030712', cursor: 'default' }}
    >
      {/* World background (Canvas2D, D3 geoPath) */}
      <canvas
        ref={worldCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, display: 'block', pointerEvents: 'none' }}
      />
      {/* Pixi canvas is appended programmatically above */}

      {/* Vehicle filter toggles */}
      <div className="absolute top-3 right-3 flex gap-1.5 z-10">
        {(['truck', 'plane', 'ship'] as VehicleType[]).map(v => (
          <button
            key={v}
            onClick={() => toggleVehicle(v)}
            title={VEHICLE_LABEL[v]}
            className={`px-2.5 py-1.5 rounded text-xs font-mono transition-all border ${
              vehicleFilter[v]
                ? 'bg-gray-800 border-gray-600 text-white opacity-100'
                : 'bg-gray-950 border-gray-800 text-gray-600 opacity-50'
            }`}
          >
            {VEHICLE_ICON[v]} {VEHICLE_LABEL[v]}
          </button>
        ))}
        <div className="flex gap-1 ml-1">
          <button
            onClick={() => zoomBy(1.25)}
            title="Zoom in"
            className="w-7 h-7 flex items-center justify-center rounded text-sm font-mono border bg-gray-950 border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            +
          </button>
          <button
            onClick={() => zoomBy(1 / 1.25)}
            title="Zoom out"
            className="w-7 h-7 flex items-center justify-center rounded text-sm font-mono border bg-gray-950 border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            −
          </button>
          <button
            onClick={() => { viewportRef.current = DEFAULT_VIEWPORT; redraw(DEFAULT_VIEWPORT) }}
            title="Reset view"
            className="w-7 h-7 flex items-center justify-center rounded text-sm font-mono border bg-gray-950 border-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
          >
            ⊕
          </button>
        </div>
      </div>

      {/* Hint */}
      <div className="absolute bottom-3 right-3 text-xs font-mono text-gray-700 pointer-events-none z-10">
        scroll to zoom · drag to pan
      </div>

      {/* Hover tooltip */}
      {hoveredInfo && <MapTooltip info={hoveredInfo} />}

      {/* City info panel */}
      {selectedCityId && (
        <RoutePanel
          cityId={selectedCityId}
          onClose={() => setSelectedCityId(null)}
        />
      )}
    </div>
  )
}
