import { useRef, useEffect, useState, useCallback } from 'react'
import { CITIES, CITY_MAP, getCityName } from '../data/cities'
import { createProjection, projectCoord } from '../map/projection'
import { drawWorldToCanvas } from '../map/worldCanvas'
import { findRouteBetween } from '../engine/pathfinding'
import type { Route } from '../engine/gameState'
import type { GeoProjection } from 'd3-geo'

interface RouteBuilderMapProps {
  sourceCity: string
  builtPath: string[]
  openRoutes: Route[]
  destinationCityIds: Set<string>       // cities that import the selected commodity
  inspectorCityId: string | null
  interpolCityId: string | null
  interpolAdditionalIds: string[]
  onCityClick: (cityId: string) => void
}

const HIT_RADIUS = 12
const MAP_HEIGHT = 220

/** Get all cities directly reachable from a city via open routes. */
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
}: RouteBuilderMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ cityId: string; x: number; y: number } | null>(null)
  const projRef = useRef<GeoProjection | null>(null)
  const cityPositionsRef = useRef<Map<string, [number, number]>>(new Map())

  const currentCity = builtPath[builtPath.length - 1] ?? sourceCity
  const reachable = getReachableFrom(currentCity, openRoutes)
  const pathSet = new Set(builtPath)

  const allThreatCities = new Set<string>()
  if (inspectorCityId) allThreatCities.add(inspectorCityId)
  if (interpolCityId) allThreatCities.add(interpolCityId)
  for (const id of interpolAdditionalIds) allThreatCities.add(id)

  // Cities that have open routes (are part of the network)
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
    const height = MAP_HEIGHT
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const projection = createProjection(width, height, { zoom: 1, panX: 0, panY: 0 })
    projRef.current = projection

    // Draw world background
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

    // Draw open routes as thin gray lines
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 0.8
    ctx.setLineDash([3, 3])
    for (const route of openRoutes) {
      const from = positions.get(route.origin)
      const to = positions.get(route.destination)
      if (!from || !to) continue
      ctx.beginPath()
      ctx.moveTo(from[0], from[1])
      ctx.lineTo(to[0], to[1])
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Draw built path as solid amber line
    if (builtPath.length > 1) {
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2.5
      ctx.shadowColor = '#f59e0b'
      ctx.shadowBlur = 6
      ctx.beginPath()
      for (let i = 0; i < builtPath.length; i++) {
        const pos = positions.get(builtPath[i]!)
        if (!pos) continue
        if (i === 0) ctx.moveTo(pos[0], pos[1])
        else ctx.lineTo(pos[0], pos[1])
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // Draw city dots
    for (const city of CITIES) {
      const pos = positions.get(city.id)
      if (!pos) continue

      const isInPath = pathSet.has(city.id)
      const isReachable = reachable.has(city.id) && !isInPath
      const isDestination = destinationCityIds.has(city.id)
      const isThreat = allThreatCities.has(city.id)
      const isSource = city.id === sourceCity
      const isCurrent = city.id === currentCity
      const isInNetwork = networkCities.has(city.id)

      const r = isSource || isCurrent ? 5 : isInPath ? 4.5 : isReachable ? 4 : 3

      // Threat glow
      if (isThreat && isInNetwork) {
        ctx.beginPath()
        ctx.arc(pos[0], pos[1], r + 5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)'
        ctx.fill()
      }

      // Destination ring
      if (isDestination && isInNetwork && !isInPath) {
        ctx.beginPath()
        ctx.arc(pos[0], pos[1], r + 3, 0, Math.PI * 2)
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // City dot
      ctx.beginPath()
      ctx.arc(pos[0], pos[1], r, 0, Math.PI * 2)
      if (isSource || isCurrent) {
        ctx.fillStyle = '#f59e0b' // amber
      } else if (isInPath) {
        ctx.fillStyle = '#10b981' // green
      } else if (isReachable) {
        ctx.fillStyle = '#e5e7eb' // white-ish
      } else if (isInNetwork) {
        ctx.fillStyle = '#6b7280' // gray
      } else {
        ctx.fillStyle = '#374151' // dark gray
      }
      ctx.fill()

      // Threat dot overlay
      if (isThreat && isInNetwork) {
        ctx.beginPath()
        ctx.arc(pos[0], pos[1], r - 1, 0, Math.PI * 2)
        ctx.fillStyle = '#ef4444'
        ctx.fill()
      }

      // City label (only for network cities)
      if (isInNetwork) {
        ctx.font = `${isInPath || isReachable ? 9 : 8}px monospace`
        ctx.fillStyle = isInPath ? '#10b981' : isReachable ? '#d1d5db' : '#6b7280'
        ctx.fillText(city.name, pos[0] + r + 3, pos[1] + 3)
      }
    }

    // Draw per-hop risk labels on the built path
    if (builtPath.length > 1) {
      ctx.font = 'bold 9px monospace'
      for (let i = 1; i < builtPath.length; i++) {
        const from = positions.get(builtPath[i - 1]!)
        const to = positions.get(builtPath[i]!)
        if (!from || !to) continue
        const mx = (from[0] + to[0]) / 2
        const my = (from[1] + to[1]) / 2 - 6
        // Risk label will be drawn by parent via overlay — skip here to avoid Canvas text limitations
      }
    }

    ctx.restore()
  }, [builtPath, openRoutes, destinationCityIds, sourceCity, currentCity, reachable, pathSet, allThreatCities, networkCities])

  useEffect(() => {
    draw()
  }, [draw])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(container)
    return () => ro.disconnect()
  }, [draw])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Find nearest city within hit radius
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

    if (nearest && reachable.has(nearest) && !pathSet.has(nearest)) {
      onCityClick(nearest)
    }
  }, [reachable, pathSet, onCityClick])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
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
      setTooltip({ cityId: nearest, x: e.clientX - (containerRef.current?.getBoundingClientRect().left ?? 0), y: e.clientY - (containerRef.current?.getBoundingClientRect().top ?? 0) })
    } else {
      setTooltip(null)
    }

    // Cursor
    const isClickable = nearest && reachable.has(nearest) && !pathSet.has(nearest)
    canvas.style.cursor = isClickable ? 'pointer' : 'default'
  }, [networkCities, reachable, pathSet])

  return (
    <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden border border-gray-700">
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: `${MAP_HEIGHT}px` }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />

      {/* Hover tooltip */}
      {tooltip && (() => {
        const city = CITY_MAP.get(tooltip.cityId)
        if (!city) return null
        const isThreat = allThreatCities.has(tooltip.cityId)
        const isDest = destinationCityIds.has(tooltip.cityId)
        const isClickable = reachable.has(tooltip.cityId) && !pathSet.has(tooltip.cityId)
        return (
          <div
            className="absolute bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs font-mono shadow-xl pointer-events-none z-10"
            style={{ left: Math.min(tooltip.x + 10, (containerRef.current?.clientWidth ?? 300) - 120), top: tooltip.y - 30 }}
          >
            <span className="text-white font-semibold">{city.name}</span>
            {isThreat && <span className="text-red-400 ml-1.5">THREAT</span>}
            {isDest && <span className="text-amber-400 ml-1.5">SELLS HERE</span>}
            {isClickable && <span className="text-gray-500 ml-1.5">click to add</span>}
          </div>
        )
      })()}
    </div>
  )
}
