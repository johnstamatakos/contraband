import { useState, useEffect } from 'react'
import { useGameStore, currentGameTimeMs } from '../store/gameStore'
import type { Route } from '../engine/gameState'
import { ROUTE_COSTS, canEstablishRoute } from '../engine/gameState'
import { CITY_MAP } from '../data/cities'
import { WEEK_MS } from '../engine/constants'
import { VEHICLE_ICON, VEHICLE_LABEL } from './vehicleConstants'

function formatGameTimeRemaining(msLeft: number): string {
  if (msLeft <= 0) return 'Opening...'
  // Convert real ms to game hours (WEEK_MS = 168 game hours)
  const gameHours = msLeft / (WEEK_MS / 168)
  if (gameHours >= 23.5) return '~1 day'
  if (gameHours >= 1) return `~${Math.ceil(gameHours)}h`
  return `~${Math.ceil(gameHours * 60)}m`
}

interface RoutePanelProps {
  cityId: string
  onClose: () => void
}

const TIER_LABEL: Record<Route['tier'], string> = {
  domestic: 'Domestic',
  regional: 'Regional',
  international: 'International',
  long_haul: 'Long Haul',
}

function TravelDaysBadge({ days }: { days: number }) {
  return (
    <span className="text-xs font-mono text-gray-400">
      {days === 1 ? '1 day' : `${days} days`}
    </span>
  )
}

function RouteRow({ route, selectedCityId }: { route: Route; selectedCityId: string }) {
  const { gameState, establishRoute, activateIllicitLayer } = useGameStore()
  const { cash } = gameState
  const [, setTick] = useState(0)
  useEffect(() => {
    if (route.status !== 'pending' || route.openAtMs === null) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [route.status, route.openAtMs])

  const isOrigin = route.origin === selectedCityId
  const otherCityId = isOrigin ? route.destination : route.origin
  const otherCity = CITY_MAP.get(otherCityId)
  if (!otherCity) return null

  const establishCost = ROUTE_COSTS[route.tier].establish
  const illicitCost = ROUTE_COSTS[route.tier].illicit
  const canAffordEstablish = cash >= establishCost
  const canAffordIllicit = cash >= illicitCost
  const eligibility = route.status === 'closed' ? canEstablishRoute(route, gameState) : { ok: true }

  const statusBadge = {
    open:    { label: 'OPEN',    cls: 'bg-emerald-900 text-emerald-400' },
    pending: { label: 'OPENING', cls: 'bg-yellow-900 text-yellow-400' },
    closed:  { label: 'CLOSED',  cls: 'bg-gray-800 text-gray-500' },
  }[route.status]

  return (
    <div className="border border-gray-800 rounded p-3 bg-gray-950 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="font-mono text-sm text-white">
          {isOrigin ? '→' : '←'} {otherCity.name}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-600">{TIER_LABEL[route.tier]}</span>
          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      {/* Vehicle types + travel times */}
      <div className="flex flex-wrap gap-2">
        {route.allowedVehicles.map(v => (
          <div key={v} className="flex items-center gap-1 bg-gray-800 rounded px-2 py-0.5">
            <span className="text-xs">{VEHICLE_ICON[v]}</span>
            <span className="text-xs font-mono text-gray-300">{VEHICLE_LABEL[v]}</span>
            {route.travelDays[v] && <TravelDaysBadge days={route.travelDays[v]!} />}
          </div>
        ))}
      </div>

      {/* Route heat (open routes) */}
      {route.status === 'open' && (
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-gray-600">Heat</span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className={`w-2 h-2 rounded-sm ${
                i <= route.heat
                  ? route.heat >= 4 ? 'bg-red-500' : route.heat >= 2 ? 'bg-orange-500' : 'bg-yellow-500'
                  : 'bg-gray-800'
              }`} />
            ))}
          </div>
          {route.illicitLayerActive && (
            <span className="text-red-400 ml-1">ILLICIT ACTIVE</span>
          )}
        </div>
      )}

      {route.status === 'pending' && (
        <p className="text-xs font-mono text-yellow-500">
          {route.openAtMs !== null
            ? `Opens in ${formatGameTimeRemaining(route.openAtMs - currentGameTimeMs)}`
            : 'Opening...'}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {route.status === 'closed' && !eligibility.ok && (
          <div className="flex-1 text-xs font-mono py-1.5 px-2 rounded bg-gray-900 border border-gray-800 text-gray-600 text-center">
            {eligibility.reason}
          </div>
        )}
        {route.status === 'closed' && eligibility.ok && (
          <button
            onClick={() => establishRoute(route.id)}
            disabled={!canAffordEstablish}
            className={`flex-1 text-xs font-mono py-1.5 px-2 rounded transition-colors ${
              canAffordEstablish
                ? 'bg-blue-700 hover:bg-blue-600 text-white cursor-pointer'
                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            Establish ${establishCost.toLocaleString()}
          </button>
        )}
        {route.status === 'open' && !route.illicitLayerActive && (
          <button
            onClick={() => activateIllicitLayer(route.id)}
            disabled={!canAffordIllicit}
            className={`flex-1 text-xs font-mono py-1.5 px-2 rounded transition-colors ${
              canAffordIllicit
                ? 'bg-red-900 hover:bg-red-800 text-red-300 cursor-pointer'
                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            Activate illicit ${illicitCost.toLocaleString()}
          </button>
        )}
      </div>
    </div>
  )
}

export function RoutePanel({ cityId, onClose }: RoutePanelProps) {
  const { gameState } = useGameStore()
  const city = CITY_MAP.get(cityId)
  if (!city) return null

  const connectedRoutes = gameState.routes.filter(
    r => r.origin === cityId || r.destination === cityId,
  )
  const open = connectedRoutes.filter(r => r.status === 'open')
  const pending = connectedRoutes.filter(r => r.status === 'pending')
  const closed = connectedRoutes.filter(r => r.status === 'closed')

  return (
    <div
      className="absolute bottom-4 left-4 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden z-20"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-gray-700">
        <div>
          <div className="font-mono font-bold text-white text-sm">{city.name}</div>
          <div className="font-mono text-xs text-gray-500 capitalize mt-0.5">
            {city.tier.replace('_', ' ')}
          </div>
          {/* City infrastructure badges */}
          <div className="flex gap-1.5 mt-1.5">
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${city.hasAirport ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-600'}`}>
              ✈️ Airport
            </span>
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${city.hasPort ? 'bg-violet-900 text-violet-300' : 'bg-gray-800 text-gray-600'}`}>
              🚢 Port
            </span>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-900 text-amber-300">
              🚛 Road
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-600 hover:text-gray-400 text-xl leading-none font-mono mt-0.5"
        >
          ×
        </button>
      </div>

      {/* Routes */}
      <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
        {connectedRoutes.length === 0 && (
          <p className="text-xs font-mono text-gray-600 text-center py-4">
            No routes connected.
          </p>
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
          <Section label="Available to Establish">
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
      <div className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-1.5">{label}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}
