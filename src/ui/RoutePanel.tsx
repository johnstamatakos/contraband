import { useState, useEffect } from 'react'
import { useGameStore, currentGameTimeMs } from '../store/gameStore'
import type { Route } from '../engine/gameState'
import { ROUTE_COSTS, canEstablishRoute } from '../engine/gameState'
import { CITY_MAP } from '../data/cities'
import { CONFIG } from '../engine/config'
import { formatTimeRemaining } from '../utils/time'
import { VEHICLE_ICON } from './vehicleConstants'

interface RoutePanelProps {
  cityId: string
  onClose: () => void
}

const TIER_LABEL: Record<Route['tier'], string> = {
  domestic:      'Domestic',
  regional:      'Regional',
  international: 'International',
  long_haul:     'Long Haul',
}

// ── Route row ─────────────────────────────────────────────────────────────────

function RouteRow({ route, selectedCityId }: { route: Route; selectedCityId: string }) {
  const { gameState, establishRoute, activateIllicitLayer } = useGameStore()
  const { cash } = gameState
  const [, setTick] = useState(0)

  useEffect(() => {
    if (route.status !== 'pending' || route.openAtMs === null) return
    const id = setInterval(() => setTick(t => t + 1), 1_000)
    return () => clearInterval(id)
  }, [route.status, route.openAtMs])

  const isOrigin    = route.origin === selectedCityId
  const otherCityId = isOrigin ? route.destination : route.origin
  const otherCity   = CITY_MAP.get(otherCityId)
  if (!otherCity) return null

  const establishCost   = ROUTE_COSTS[route.tier].establish
  const illicitCost     = ROUTE_COSTS[route.tier].illicit
  const canAffordEstablish = cash >= establishCost
  const canAffordIllicit   = cash >= illicitCost
  const eligibility        = route.status === 'closed' ? canEstablishRoute(route, gameState) : { ok: true }

  const statusBadge = {
    open:    { label: 'OPEN',    cls: 'bg-emerald-900 text-emerald-400' },
    pending: { label: 'OPENING', cls: 'bg-yellow-900 text-yellow-400' },
    closed:  { label: 'CLOSED',  cls: 'bg-gray-800 text-gray-500' },
  }[route.status]

  // Compact travel-time string: "✈1d 🚛2d"
  const travelSummary = route.allowedVehicles
    .map(v => `${VEHICLE_ICON[v]}${route.travelDays[v] ? `${route.travelDays[v]}d` : ''}`)
    .join(' ')

  return (
    <div className="border border-gray-800 rounded p-2.5 bg-gray-950 space-y-1.5">
      {/* Header: destination + tier + status */}
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-sm text-white truncate">
          {isOrigin ? '→' : '←'} {otherCity.name}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-mono text-gray-600">{TIER_LABEL[route.tier]}</span>
          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      {/* Vehicles + heat + illicit status */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-gray-500">{travelSummary}</span>
        {route.status === 'open' && (
          <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className={`w-1.5 h-1.5 rounded-sm ${
                  i <= route.heat
                    ? route.heat >= 4 ? 'bg-red-500' : route.heat >= 2 ? 'bg-orange-500' : 'bg-yellow-500'
                    : 'bg-gray-800'
                }`} />
              ))}
            </div>
            {route.illicitLayerActive && (
              <span className="text-xs font-mono text-red-400">ILLICIT</span>
            )}
          </div>
        )}
      </div>

      {route.status === 'pending' && route.openAtMs !== null && (
        <p className="text-xs font-mono text-yellow-500">
          {formatTimeRemaining(route.openAtMs - currentGameTimeMs)}
        </p>
      )}

      {/* Flagged warning */}
      {route.status === 'open' && route.flaggedTurnsRemaining > 0 && (
        <p className="text-xs font-mono text-orange-400">
          Under investigation — {route.flaggedTurnsRemaining}w remaining
        </p>
      )}

      {/* Actions */}
      {route.status === 'closed' && !eligibility.ok && (
        <div className="text-xs font-mono py-1.5 px-2 rounded bg-gray-900 border border-gray-800 text-gray-600 text-center">
          {eligibility.reason}
        </div>
      )}
      {route.status === 'closed' && eligibility.ok && (
        <button
          onClick={() => establishRoute(route.id)}
          disabled={!canAffordEstablish}
          className={`w-full text-xs font-mono py-1.5 rounded transition-colors ${
            canAffordEstablish
              ? 'bg-blue-700 hover:bg-blue-600 text-white cursor-pointer'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed'
          }`}
        >
          Establish — ${establishCost.toLocaleString()}
        </button>
      )}
      {route.status === 'open' && !route.illicitLayerActive && (
        <button
          onClick={() => activateIllicitLayer(route.id)}
          disabled={!canAffordIllicit}
          className={`w-full text-xs font-mono py-1.5 rounded transition-colors ${
            canAffordIllicit
              ? 'bg-red-900 hover:bg-red-800 text-red-300 cursor-pointer'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed'
          }`}
        >
          Activate illicit layer — ${illicitCost.toLocaleString()}
        </button>
      )}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function RoutePanel({ cityId, onClose }: RoutePanelProps) {
  const { gameState } = useGameStore()
  const city = CITY_MAP.get(cityId)
  if (!city) return null

  const connected = gameState.routes.filter(r => r.origin === cityId || r.destination === cityId)
  const open    = connected.filter(r => r.status === 'open')
  const pending = connected.filter(r => r.status === 'pending')
  const closed  = connected.filter(r => r.status === 'closed')

  // Threat presence at this city
  const inspectorHere = gameState.inspector.currentCityId === cityId
  const interpolHere  = gameState.interpol.currentCityId  === cityId

  // Interpol 1-hop adjacency (city is adjacent to Interpol on international graph)
  const interpolAdjacent = !interpolHere && gameState.interpol.currentCityId !== null &&
    gameState.routes.some(r =>
      r.status === 'open' &&
      (r.tier === 'international' || r.tier === 'long_haul') &&
      (r.origin === gameState.interpol.currentCityId || r.destination === gameState.interpol.currentCityId) &&
      (r.origin === cityId || r.destination === cityId),
    )

  const d = CONFIG.detection

  return (
    <div
      className="absolute bottom-4 left-4 w-[400px] max-h-[calc(100vh-7rem)] flex flex-col bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-20"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="shrink-0 flex items-start justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex-1 min-w-0">
          <div className="font-mono font-bold text-white">{city.name}</div>
          <div className="font-mono text-xs text-gray-500 capitalize mt-0.5">
            {city.tier.replace('_', ' ')}
          </div>
          {/* Infrastructure */}
          <div className="flex gap-1.5 mt-2">
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${city.hasAirport ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-600'}`}>
              ✈ Airport
            </span>
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${city.hasPort ? 'bg-violet-900 text-violet-300' : 'bg-gray-800 text-gray-600'}`}>
              ⚓ Port
            </span>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-900 text-amber-300">
              ⬡ Road
            </span>
          </div>
          {/* Threat warnings */}
          {(inspectorHere || interpolHere || interpolAdjacent) && (
            <div className="mt-2 space-y-1">
              {inspectorHere && (
                <div className="flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded bg-red-950/60 border border-red-900/50 text-red-400">
                  <span>⬤</span>
                  <span>Inspector present — +{Math.round(d.inspectorBonus * 100)}% detection on domestic/regional</span>
                </div>
              )}
              {interpolHere && (
                <div className="flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded bg-blue-950/60 border border-blue-900/50 text-blue-400">
                  <span>⬤</span>
                  <span>Interpol present — +{Math.round(d.interpolBonus * 100)}% detection on international</span>
                </div>
              )}
              {interpolAdjacent && (
                <div className="flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded bg-blue-950/40 border border-blue-900/30 text-blue-500">
                  <span>◯</span>
                  <span>Interpol nearby — +{Math.round(d.interpolAdjacentBonus * 100)}% detection on international</span>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-600 hover:text-gray-400 text-xl leading-none font-mono ml-3 mt-0.5 shrink-0"
        >
          ×
        </button>
      </div>

      {/* Routes — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {connected.length === 0 && (
          <p className="text-xs font-mono text-gray-600 text-center py-4">No routes connected.</p>
        )}
        {open.length > 0 && (
          <Section label="Open">
            {open.map(r => <RouteRow key={r.id} route={r} selectedCityId={cityId} />)}
          </Section>
        )}
        {pending.length > 0 && (
          <Section label="Pending">
            {pending.map(r => <RouteRow key={r.id} route={r} selectedCityId={cityId} />)}
          </Section>
        )}
        {closed.length > 0 && (
          <Section label="Establish">
            {closed.map(r => <RouteRow key={r.id} route={r} selectedCityId={cityId} />)}
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider px-1 mb-1.5">
        {label}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}
