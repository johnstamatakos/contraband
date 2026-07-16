import { useState, useEffect } from 'react'
import { useGameStore, currentGameTimeMs } from '../store/gameStore'
import type { Route } from '../engine/gameState'
import { ROUTE_COSTS, canEstablishRoute } from '../engine/gameState'
import { CITY_MAP } from '../data/cities'
import { formatTimeRemaining } from '../utils/time'
import { VEHICLE_ICON } from './vehicleConstants'

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

  const establishCost    = ROUTE_COSTS[route.tier].establish
  const illicitCost      = ROUTE_COSTS[route.tier].illicit
  const canAffordEstab   = cash >= establishCost
  const canAffordIllicit = cash >= illicitCost
  const eligibility      = route.status === 'closed' ? canEstablishRoute(route, gameState) : { ok: true }

  const statusBadge = {
    open:    { label: 'OPEN',    cls: 'bg-emerald-900 text-emerald-400' },
    pending: { label: 'OPENING', cls: 'bg-yellow-900 text-yellow-400' },
    closed:  { label: 'CLOSED',  cls: 'bg-gray-800 text-gray-500' },
  }[route.status]

  const travelSummary = route.allowedVehicles
    .map(v => `${VEHICLE_ICON[v]}${route.travelDays[v] ? `${route.travelDays[v]}d` : ''}`)
    .join(' ')

  return (
    <div className="border border-gray-800 rounded-lg p-3 bg-gray-950 space-y-2">
      {/* Header: destination + tier + status */}
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-sm font-semibold text-white truncate">
          {isOrigin ? '→' : '←'} {otherCity.name}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-mono text-gray-600">{TIER_LABEL[route.tier]}</span>
          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      {/* Transport modes + travel times */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-gray-500">{travelSummary}</span>
        {route.status === 'open' && (
          <div className="flex items-center gap-1.5">
            {/* Heat bars */}
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

      {/* Pending countdown */}
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
          disabled={!canAffordEstab}
          className={`w-full text-xs font-mono py-1.5 rounded transition-colors ${
            canAffordEstab
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
          Activate illicit — ${illicitCost.toLocaleString()}
        </button>
      )}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <span className="text-xs font-mono text-gray-600">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  cityId: string
  onClose: () => void
}

export function RoutesModal({ cityId, onClose }: Props) {
  const { gameState } = useGameStore()
  const city = CITY_MAP.get(cityId)
  if (!city) return null

  // Deduplicate by city pair — keep the higher-status direction
  const allConnected = gameState.routes.filter(r => r.origin === cityId || r.destination === cityId)
  const seen = new Map<string, Route>()
  for (const route of allConnected) {
    const otherId = route.origin === cityId ? route.destination : route.origin
    const existing = seen.get(otherId)
    if (!existing) { seen.set(otherId, route); continue }
    const rank = (r: Route) => r.status === 'open' ? 2 : r.status === 'pending' ? 1 : 0
    if (rank(route) > rank(existing)) seen.set(otherId, route)
  }
  const connected = [...seen.values()]
  const open    = connected.filter(r => r.status === 'open')
  const pending = connected.filter(r => r.status === 'pending')
  const closed  = connected.filter(r => r.status === 'closed')

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4">
        <div className="pointer-events-auto bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">

          {/* Header */}
          <div className="shrink-0 px-5 py-4 border-b border-gray-700 flex items-center justify-between">
            <div>
              <div className="text-base font-mono font-bold text-white">{city.name} — Routes</div>
              <div className="text-xs font-mono text-gray-500 mt-0.5">
                {open.length} open · {pending.length} pending · {closed.length} available
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">✕</button>
          </div>

          {/* Route list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {connected.length === 0 && (
              <p className="text-xs font-mono text-gray-600 text-center py-6">No routes connected to this city.</p>
            )}
            <Section label="Open" count={open.length}>
              {open.map(r => <RouteRow key={r.id} route={r} selectedCityId={cityId} />)}
            </Section>
            <Section label="Pending" count={pending.length}>
              {pending.map(r => <RouteRow key={r.id} route={r} selectedCityId={cityId} />)}
            </Section>
            <Section label="Establish" count={closed.length}>
              {closed.map(r => <RouteRow key={r.id} route={r} selectedCityId={cityId} />)}
            </Section>
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-3 border-t border-gray-700">
            <button
              onClick={onClose}
              className="w-full py-2 text-xs font-mono rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
