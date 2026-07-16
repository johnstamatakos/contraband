import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { CITY_MAP } from '../data/cities'
import { CONFIG } from '../engine/config'
import { CITY_COMMODITIES } from '../data/commodities'
import { RoutesModal } from './RoutesModal'

interface RoutePanelProps {
  cityId: string
  onClose: () => void
}

export function RoutePanel({ cityId, onClose }: RoutePanelProps) {
  const { gameState } = useGameStore()
  const [routesOpen, setRoutesOpen] = useState(false)

  const city = CITY_MAP.get(cityId)
  if (!city) return null

  const commods = CITY_COMMODITIES[cityId]
  const connectedCount = new Set(
    gameState.routes
      .filter(r => r.origin === cityId || r.destination === cityId)
      .map(r => (r.origin === cityId ? r.destination : r.origin)),
  ).size

  // Threat presence
  const inspectorHere = gameState.inspector.currentCityId === cityId
  const allInterpolCities = [
    ...(gameState.interpol.currentCityId !== null ? [gameState.interpol.currentCityId] : []),
    ...gameState.interpol.additionalCityIds,
  ]
  const interpolHere = allInterpolCities.includes(cityId)
  const interpolAdjacent = !interpolHere && allInterpolCities.length > 0 &&
    gameState.routes.some(r =>
      r.status === 'open' &&
      (r.tier === 'international' || r.tier === 'long_haul') &&
      allInterpolCities.some(p => r.origin === p || r.destination === p) &&
      (r.origin === cityId || r.destination === cityId),
    )

  const d = CONFIG.detection

  return (
    <>
      <div
        className="absolute bottom-4 left-4 w-[360px] flex flex-col bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-20"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-3 pb-2">
          <div>
            <div className="font-mono font-bold text-white text-lg">{city.name}</div>
            <div className="font-mono text-xs text-gray-500 capitalize">{city.tier.replace('_', ' ')}</div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-400 text-lg leading-none font-mono ml-3 shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Transport modes — only show available */}
        <div className="px-4 pb-2 flex gap-1.5">
          {city.hasAirport && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-800/40">
              ✈ Airport
            </span>
          )}
          {city.hasPort && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-violet-900/60 text-violet-300 border border-violet-800/40">
              ⚓ Port
            </span>
          )}
          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-800/40">
            ⬡ Road
          </span>
        </div>

        {/* Commodities */}
        {commods && (
          <div className="px-4 py-2 space-y-2 border-t border-gray-800">
            {/* Exports */}
            <div>
              <div className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider mb-1">Exports</div>
              <div className="flex flex-wrap gap-1">
                {commods.legitExports.map(c => (
                  <span key={c} className="text-xs font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/40">{c}</span>
                ))}
                {commods.illicitExports.map(c => (
                  <span key={c} className="text-xs font-mono px-1.5 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-900/40">{c}</span>
                ))}
                {commods.legitExports.length === 0 && commods.illicitExports.length === 0 && (
                  <span className="text-xs font-mono text-gray-700 italic">None</span>
                )}
              </div>
            </div>

            {/* Imports */}
            <div>
              <div className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider mb-1">Imports</div>
              <div className="flex flex-wrap gap-1">
                {commods.legitImports.map(c => (
                  <span key={c} className="text-xs font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/40">{c}</span>
                ))}
                {commods.illicitImports.map(c => (
                  <span key={c} className="text-xs font-mono px-1.5 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-900/40">{c}</span>
                ))}
                {commods.legitImports.length === 0 && commods.illicitImports.length === 0 && (
                  <span className="text-xs font-mono text-gray-700 italic">None</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Threat warnings */}
        {(inspectorHere || interpolHere || interpolAdjacent) && (
          <div className="px-4 py-2 space-y-1 border-t border-gray-800">
            {inspectorHere && (
              <div className="flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded bg-red-950/50 border border-red-900/40 text-red-400">
                <span className="shrink-0">●</span>
                <span>Inspector — +{Math.round(d.inspectorBonus * 100)}% detection</span>
              </div>
            )}
            {interpolHere && (
              <div className="flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded bg-blue-950/50 border border-blue-900/40 text-blue-400">
                <span className="shrink-0">●</span>
                <span>Interpol — +{Math.round(d.interpolBonus * 100)}% detection</span>
              </div>
            )}
            {interpolAdjacent && (
              <div className="flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded bg-blue-950/30 border border-blue-900/30 text-blue-500">
                <span className="shrink-0">○</span>
                <span>Interpol nearby — +{Math.round(d.interpolAdjacentBonus * 100)}%</span>
              </div>
            )}
          </div>
        )}

        {/* Routes CTA */}
        <div className="px-4 py-3 border-t border-gray-800">
          <button
            onClick={() => setRoutesOpen(true)}
            className="w-full py-2 rounded-lg bg-blue-900 hover:bg-blue-800 border border-blue-700 text-blue-200 text-sm font-mono font-semibold tracking-wide transition-colors"
          >
            Manage Routes ({connectedCount})
          </button>
        </div>
      </div>

      {/* Routes modal */}
      {routesOpen && (
        <RoutesModal cityId={cityId} onClose={() => setRoutesOpen(false)} />
      )}
    </>
  )
}
