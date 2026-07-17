import { useRef, useEffect, useState, useCallback } from 'react'
import { CITIES, CITY_MAP } from '../data/cities'
import { createProjection, projectCoord, zoomViewport, DEFAULT_VIEWPORT } from '../map/projection'
import type { Viewport } from '../map/projection'
import { drawWorldToCanvas } from '../map/worldCanvas'
import { ROUTE_VISUAL_WAYPOINTS } from '../data/routeWaypoints'
import { smoothSegment } from '../map/routeLayer'
import type { Route } from '../engine/gameState'
import type { GeoProjection } from 'd3-geo'

interface RouteBuilderMapProps {
  sourceCity: string
  builtPath: string[]
  openRoutes: Route[]
  destinationCityIds: Set<string>
  inspectorCityId: string | null
  interpolCityId: string | null
  interpolAdditionalIds: string[]
  onCityClick: (cityId: string) => void
  onBacktrack: (cityId: string) => void
}

const HIT_RADIUS = 14

// Routes that cross the antimeridian — draw as two segments going off opposite edges
const ANTIMERIDIAN_ROUTES = new Set([
  'route_los_angeles_tokyo',
  'route_tokyo_los_angeles',
  'route_los_angeles_singapore',
  'route_singapore_los_angeles',
])

/** Draw a line from city A to city B, routing through visual waypoints if defined. */
function drawRouteLine(
  ctx: CanvasRenderingContext2D,
  fromPos: [number, number],
  toPos: [number, number],
  routeId: string,
  projection: GeoProjection,
  canvasWidth: number,
  _canvasHeight: number,
) {
  // For antimeridian routes, draw two segments exiting off opposite edges
  if (ANTIMERIDIAN_ROUTES.has(routeId)) {
    // Left segment: from city on the left side, going further left off-screen
    // Right segment: from city on the right side, going further right off-screen
    const [leftPos, rightPos] = fromPos[0] < toPos[0] ? [fromPos, toPos] : [toPos, fromPos]

    // Left city goes off the left edge
    const leftEdgeY = leftPos[1] + (leftPos[1] - rightPos[1]) * 0.15
    ctx.beginPath()
    ctx.moveTo(leftPos[0], leftPos[1])
    ctx.lineTo(-10, leftEdgeY)
    ctx.stroke()

    // Right city goes off the right edge
    const rightEdgeY = rightPos[1] + (rightPos[1] - leftPos[1]) * 0.15
    ctx.beginPath()
    ctx.moveTo(rightPos[0], rightPos[1])
    ctx.lineTo(canvasWidth + 10, rightEdgeY)
    ctx.stroke()
    return
  }

  const waypoints = ROUTE_VISUAL_WAYPOINTS[routeId]
  const pts: [number, number][] = [fromPos]
  if (waypoints) {
    for (const [lon, lat] of waypoints) {
      const wp = projectCoord(projection, lon, lat)
      if (wp) pts.push(wp)
    }
  }
  pts.push(toPos)

  const smoothPts = smoothSegment(pts)
  ctx.beginPath()
  ctx.moveTo(smoothPts[0]![0], smoothPts[0]![1])
  for (let i = 1; i < smoothPts.length; i++) {
    ctx.lineTo(smoothPts[i]![0], smoothPts[i]![1])
  }
  ctx.stroke()
}

function getReachableFrom(cityId: string, openRoutes: Route[]): Set<string> {
  const reachable = new Set<string>()
  for (const r of openRoutes) {
    if (r.origin === cityId) reachable.add(r.destination)
    if (r.destination === cityId) reachable.add(r.origin)
  }
  return reachable
}

export function RouteBuilderMap({
  sourceCity,
  builtPath,
  openRoutes,
  destinationCityIds,
  inspectorCityId,
  interpolCityId,
  interpolAdditionalIds,
  onCityClick,
  onBacktrack,
}: RouteBuilderMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ cityId: string; x: number; y: number } | null>(null)
  const cityPositionsRef = useRef<Map<string, [number, number]>>(new Map())

  // Viewport state for zoom/pan
  const viewportRef = useRef<Viewport>({ ...DEFAULT_VIEWPORT })
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const [, setRenderTick] = useState(0) // force re-render after viewport changes

  const currentCity = builtPath[builtPath.length - 1] ?? sourceCity
  const reachable = getReachableFrom(currentCity, openRoutes)
  const pathSet = new Set(builtPath)

  const allThreatCities = new Set<string>()
  if (inspectorCityId) allThreatCities.add(inspectorCityId)
  if (interpolCityId) allThreatCities.add(interpolCityId)
  for (const id of interpolAdditionalIds) allThreatCities.add(id)

  const networkCities = new Set<string>()
  for (const r of openRoutes) {
    networkCities.add(r.origin)
    networkCities.add(r.destination)
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const width = container.clientWidth
    const height = container.clientHeight
    if (width <= 0 || height <= 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const projection = createProjection(width, height, viewportRef.current)

    drawWorldToCanvas(canvas, projection)

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.save()
    ctx.scale(dpr, dpr)

    // Cache city positions
    const positions = new Map<string, [number, number]>()
    for (const city of CITIES) {
      const coord = projectCoord(projection, city.lon, city.lat)
      if (coord) positions.set(city.id, coord)
    }
    cityPositionsRef.current = positions

    const zoom = viewportRef.current.zoom

    // Draw open routes as thin gray lines (with waypoints)
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = Math.max(0.8, 1 * zoom)
    ctx.setLineDash([4, 3])
    for (const route of openRoutes) {
      const from = positions.get(route.origin)
      const to = positions.get(route.destination)
      if (!from || !to) continue
      drawRouteLine(ctx, from, to, route.id, projection, width, height)
    }
    ctx.setLineDash([])

    // Draw built path as solid amber line (with waypoints per hop)
    if (builtPath.length > 1) {
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = Math.max(2.5, 3 * zoom)
      ctx.shadowColor = '#f59e0b'
      ctx.shadowBlur = 8
      for (let i = 0; i < builtPath.length - 1; i++) {
        const from = positions.get(builtPath[i]!)
        const to = positions.get(builtPath[i + 1]!)
        if (!from || !to) continue
        const routeId = `route_${builtPath[i]}_${builtPath[i + 1]}`
        const reverseId = `route_${builtPath[i + 1]}_${builtPath[i]}`
        const id = ROUTE_VISUAL_WAYPOINTS[routeId] ? routeId : reverseId
        drawRouteLine(ctx, from, to, id, projection, width, height)
      }
      ctx.shadowBlur = 0
    }

    // Scale city dot sizes with zoom
    const baseR = Math.max(3, 4 * Math.min(zoom, 3))
    const fontSize = Math.max(8, Math.round(10 * Math.min(zoom, 2.5)))

    // Draw city dots
    for (const city of CITIES) {
      const pos = positions.get(city.id)
      if (!pos) continue
      // Skip cities far off-screen
      if (pos[0] < -50 || pos[0] > width + 50 || pos[1] < -50 || pos[1] > height + 50) continue

      const isInPath = pathSet.has(city.id)
      const isReachable = reachable.has(city.id) && !isInPath
      const isDestination = destinationCityIds.has(city.id)
      const isThreat = allThreatCities.has(city.id)
      const isSource = city.id === sourceCity
      const isCurrent = city.id === currentCity
      const isInNetwork = networkCities.has(city.id)

      const r = isSource || isCurrent ? baseR + 2 : isInPath ? baseR + 1 : isReachable ? baseR : baseR - 1

      // Threat glow
      if (isThreat && isInNetwork) {
        ctx.beginPath()
        ctx.arc(pos[0], pos[1], r + 6, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(239, 68, 68, 0.3)'
        ctx.fill()
      }

      // Destination ring
      if (isDestination && isInNetwork && !isInPath) {
        ctx.beginPath()
        ctx.arc(pos[0], pos[1], r + 4, 0, Math.PI * 2)
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // City dot
      ctx.beginPath()
      ctx.arc(pos[0], pos[1], r, 0, Math.PI * 2)
      if (isSource || isCurrent) {
        ctx.fillStyle = '#f59e0b'
      } else if (isInPath) {
        ctx.fillStyle = '#10b981'
      } else if (isReachable) {
        ctx.fillStyle = '#e5e7eb'
      } else if (isInNetwork) {
        ctx.fillStyle = '#6b7280'
      } else {
        ctx.fillStyle = '#374151'
      }
      ctx.fill()

      // Threat dot overlay
      if (isThreat && isInNetwork) {
        ctx.beginPath()
        ctx.arc(pos[0], pos[1], r - 1, 0, Math.PI * 2)
        ctx.fillStyle = '#ef4444'
        ctx.fill()
      }

      // City label
      if (isInNetwork) {
        ctx.font = `${isInPath || isReachable ? fontSize : fontSize - 1}px monospace`
        ctx.fillStyle = isInPath ? '#10b981' : isReachable ? '#d1d5db' : '#6b7280'
        ctx.fillText(city.name, pos[0] + r + 4, pos[1] + 4)
      }
    }

    ctx.restore()
  }, [builtPath, openRoutes, destinationCityIds, sourceCity, currentCity, reachable, pathSet, allThreatCities, networkCities])

  useEffect(() => { draw() }, [draw])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(container)
    return () => ro.disconnect()
  }, [draw])

  // Zoom (mouse wheel)
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = container.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      viewportRef.current = zoomViewport(viewportRef.current, factor, sx, sy, container.clientWidth, container.clientHeight)
      draw()
      setRenderTick(t => t + 1)
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [draw])

  // Pan (mouse drag)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onMouseDown = (e: MouseEvent) => {
      e.stopPropagation() // Prevent main map from receiving drag events
      if (e.button !== 0) return
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panX: viewportRef.current.panX,
        panY: viewportRef.current.panY,
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return
      didDragRef.current = true
      viewportRef.current = {
        ...viewportRef.current,
        panX: dragRef.current.panX + dx,
        panY: dragRef.current.panY + dy,
      }
      draw()
      setRenderTick(t => t + 1)
      canvas.style.cursor = 'grabbing'
    }

    const onMouseUp = () => {
      dragRef.current = null
      canvas.style.cursor = ''
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [draw])

  // Track whether a drag actually moved (to distinguish from clicks)
  const didDragRef = useRef(false)

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (didDragRef.current) { didDragRef.current = false; return }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    let nearest: string | null = null
    let nearestDist = Infinity
    for (const [cityId, pos] of cityPositionsRef.current) {
      const dx = pos[0] - x
      const dy = pos[1] - y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < HIT_RADIUS && dist < nearestDist) {
        nearest = cityId
        nearestDist = dist
      }
    }

    if (!nearest) return

    // Backtrack: click a city already in the path (not the source) to truncate
    if (pathSet.has(nearest) && nearest !== sourceCity) {
      onBacktrack(nearest)
      return
    }

    // Add new hop
    if (reachable.has(nearest) && !pathSet.has(nearest)) {
      onCityClick(nearest)
    }
  }, [reachable, pathSet, onCityClick, onBacktrack, sourceCity])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) { setTooltip(null); return }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    let nearest: string | null = null
    let nearestDist = Infinity
    for (const [cityId, pos] of cityPositionsRef.current) {
      if (!networkCities.has(cityId)) continue
      const dx = pos[0] - x
      const dy = pos[1] - y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < HIT_RADIUS && dist < nearestDist) {
        nearest = cityId
        nearestDist = dist
      }
    }

    if (nearest) {
      setTooltip({
        cityId: nearest,
        x: e.clientX - (containerRef.current?.getBoundingClientRect().left ?? 0),
        y: e.clientY - (containerRef.current?.getBoundingClientRect().top ?? 0),
      })
    } else {
      setTooltip(null)
    }

    const isClickable = nearest && ((reachable.has(nearest) && !pathSet.has(nearest)) || (pathSet.has(nearest) && nearest !== sourceCity))
    canvas.style.cursor = isClickable ? 'pointer' : 'default'
  }, [networkCities, reachable, pathSet])

  const handleReset = useCallback(() => {
    viewportRef.current = { ...DEFAULT_VIEWPORT }
    draw()
    setRenderTick(t => t + 1)
  }, [draw])

  return (
    <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden border border-gray-700" style={{ height: '100%', minHeight: 300 }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />

      {/* Zoom controls */}
      <div className="absolute top-2 right-2 flex gap-1 z-10">
        <button
          onClick={() => {
            const c = containerRef.current
            if (!c) return
            viewportRef.current = zoomViewport(viewportRef.current, 1.3, c.clientWidth / 2, c.clientHeight / 2, c.clientWidth, c.clientHeight)
            draw(); setRenderTick(t => t + 1)
          }}
          className="w-6 h-6 flex items-center justify-center rounded text-xs font-mono border bg-gray-950/80 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >+</button>
        <button
          onClick={() => {
            const c = containerRef.current
            if (!c) return
            viewportRef.current = zoomViewport(viewportRef.current, 1 / 1.3, c.clientWidth / 2, c.clientHeight / 2, c.clientWidth, c.clientHeight)
            draw(); setRenderTick(t => t + 1)
          }}
          className="w-6 h-6 flex items-center justify-center rounded text-xs font-mono border bg-gray-950/80 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >−</button>
        <button onClick={handleReset}
          className="w-6 h-6 flex items-center justify-center rounded text-xs font-mono border bg-gray-950/80 border-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
        >⊕</button>
      </div>

      {/* Hint */}
      <div className="absolute bottom-1.5 right-2 text-xs font-mono text-gray-600 pointer-events-none z-10">
        scroll to zoom · drag to pan · click city to add
      </div>

      {/* Hover tooltip */}
      {tooltip && (() => {
        const city = CITY_MAP.get(tooltip.cityId)
        if (!city) return null
        const isThreat = allThreatCities.has(tooltip.cityId)
        const isDest = destinationCityIds.has(tooltip.cityId)
        const isInPath = pathSet.has(tooltip.cityId) && tooltip.cityId !== sourceCity
        const isClickable = (reachable.has(tooltip.cityId) && !pathSet.has(tooltip.cityId)) || isInPath
        return (
          <div
            className="absolute bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs font-mono shadow-xl pointer-events-none z-10"
            style={{ left: Math.min(tooltip.x + 10, (containerRef.current?.clientWidth ?? 300) - 140), top: tooltip.y - 30 }}
          >
            <span className="text-white font-semibold">{city.name}</span>
            {isThreat && <span className="text-red-400 ml-1.5">THREAT</span>}
            {isDest && <span className="text-amber-400 ml-1.5">SELLS HERE</span>}
            {isInPath && <span className="text-yellow-500 ml-1.5">click to backtrack</span>}
            {isClickable && !isInPath && <span className="text-gray-500 ml-1.5">click to add</span>}
          </div>
        )
      })()}
    </div>
  )
}
