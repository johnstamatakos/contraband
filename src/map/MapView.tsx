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

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false

    initPixiApp(container, viewportRef.current, {
      onCityClick: handleCityClick,
      onStageClick: handleStageClick,
    }, gameTimeMsRef).then((handle) => {
      if (cancelled) { handle.cleanup(); return }
      pixiRef.current = handle
    }).catch(console.error)

    return () => {
      cancelled = true
      pixiRef.current?.cleanup()
      pixiRef.current = null
    }
  }, [handleCityClick, handleStageClick])

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
        <button
          onClick={() => redraw(viewportRef.current)}
          title="Reset view"
          className="px-2.5 py-1.5 rounded text-xs font-mono border bg-gray-950 border-gray-800 text-gray-500 hover:text-gray-300 transition-colors ml-1"
          onDoubleClick={() => {
            viewportRef.current = DEFAULT_VIEWPORT
            redraw(DEFAULT_VIEWPORT)
          }}
        >
          ⊕
        </button>
      </div>

      {/* Zoom hint */}
      <div className="absolute bottom-3 right-3 text-xs font-mono text-gray-700 pointer-events-none z-10">
        scroll to zoom · drag to pan · dbl-click ⊕ to reset
      </div>

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
