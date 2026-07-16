import { useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore, type SmuggleRunConfig } from '../store/gameStore'
import { CONFIG } from '../engine/config'
import { getCityName } from '../data/cities'
import { getSellDestinations } from '../data/commodities'
import { findShortestPath, findRouteBetween, canVehicleTraversePath } from '../engine/pathfinding'
import { smuggleHopDetection } from '../engine/detection'
import { VEHICLE_ICON } from './vehicleConstants'
import { RouteBuilderMap } from './RouteBuilderMap'
import type { Vehicle, Route } from '../engine/gameState'

interface SmugglePlannerModalProps {
  cityId: string
  onClose: () => void
}

function computeRepReward(hops: { routeTier: string }[], volume: number): number {
  const rr = CONFIG.smuggling.repReward
  const maxTierRep = Math.max(...hops.map(h => rr.baseTierRep[h.routeTier] ?? 1))
  const hopMult = Math.min(rr.hopMultiplierCap, 1.0 + (hops.length - 1) * rr.hopMultiplierStep)
  const volMult = 1.0 + Math.min(rr.volumeMultiplierCap, Math.floor(volume / rr.volumeStepSize) * rr.volumeMultiplierStep)
  return Math.floor(maxTierRep * hopMult * volMult)
}

function HopRiskRow({ label, prob, breakdown }: {
  label: string
  prob: number
  breakdown: ReturnType<typeof smuggleHopDetection>['breakdown']
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const factors = [
    { label: 'Base', value: breakdown.base, positive: true },
    { label: 'Route heat', value: breakdown.routeHeat, positive: true },
    { label: 'Global heat', value: breakdown.globalHeat, positive: true },
    { label: 'Consecutive', value: breakdown.consecutiveRuns, positive: true },
    { label: 'Threat', value: breakdown.threatBonus, positive: true },
    { label: 'Vehicles', value: breakdown.vehiclePenalty, positive: true },
    { label: 'Volume', value: breakdown.volumePenalty, positive: true },
    { label: 'Skills', value: breakdown.skillsReduction, positive: false },
    { label: 'Concealment', value: breakdown.concealmentReduction, positive: false },
    { label: 'Legit cover', value: breakdown.legitCover, positive: false },
  ].filter(f => f.value > 0.001)

  return (
    <div
      className="flex justify-between text-xs font-mono cursor-help"
      onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      <span className="text-gray-400 truncate">{label}</span>
      <span className="text-red-400">{Math.round(prob * 100)}%</span>
      {pos && createPortal(
        <div
          className="fixed bg-gray-950 border border-gray-700 rounded p-2 text-xs font-mono min-w-[10rem] shadow-xl pointer-events-none"
          style={{ left: pos.x + 12, top: pos.y - 80, zIndex: 9999 }}
        >
          {factors.map(f => (
            <div key={f.label} className="flex justify-between gap-3">
              <span className="text-gray-500">{f.label}</span>
              <span className={f.positive ? 'text-red-400' : 'text-green-400'}>
                {f.positive ? '+' : '−'}{Math.round(f.value * 100)}%
              </span>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-gray-700 mt-1 pt-1">
            <span className="text-gray-300">Detection</span>
            <span className="text-red-400">{Math.round(breakdown.final * 100)}%</span>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

export function SmugglePlannerModal({ cityId, onClose }: SmugglePlannerModalProps) {
  const { gameState, launchSmuggleRun } = useGameStore()
  const cityInv = gameState.cityInventory[cityId] ?? {}

  // Step 1: commodity selection
  const commodityOptions = useMemo(() =>
    Object.entries(cityInv)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => {
        const def = CONFIG.smuggling.commodities[key as keyof typeof CONFIG.smuggling.commodities]
        return def ? { key, qty, ...def } : null
      })
      .filter(Boolean) as Array<{ key: string; qty: number; displayName: string; icon: string; buyPrice: number; tier: number }>,
  [cityInv])

  const [selectedCommodity, setSelectedCommodity] = useState(commodityOptions[0]?.key ?? '')

  // Destination cities for the selected commodity (used by map to highlight)
  const destinationCityIds = useMemo(() => {
    if (!selectedCommodity) return new Set<string>()
    return new Set(getSellDestinations(selectedCommodity).map(d => d.cityId))
  }, [selectedCommodity])

  // Step 2: route building (manual via map)
  const [builtPath, setBuiltPath] = useState<string[]>([cityId])

  const lastCity = builtPath[builtPath.length - 1]!
  const isRouteComplete = builtPath.length >= 2 && destinationCityIds.has(lastCity)

  // Sell price at destination (if route is complete)
  const sellDestinations = useMemo(() => {
    if (!selectedCommodity) return []
    return getSellDestinations(selectedCommodity)
  }, [selectedCommodity])
  const sellPrice = isRouteComplete
    ? (sellDestinations.find(d => d.cityId === lastCity)?.sellPrice ?? 0)
    : 0

  const handleCityClick = useCallback((nextCityId: string) => {
    setBuiltPath(prev => [...prev, nextCityId])
    setSelectedVehicleIds([])
    setVolume(0)
  }, [])

  const handleUndo = useCallback(() => {
    if (builtPath.length <= 1) return
    setBuiltPath(prev => prev.slice(0, -1))
    setSelectedVehicleIds([])
    setVolume(0)
  }, [builtPath.length])

  const handleClear = useCallback(() => {
    setBuiltPath([cityId])
    setSelectedVehicleIds([])
    setVolume(0)
  }, [cityId])

  const handleAuto = useCallback(() => {
    // Find shortest path to the nearest reachable destination
    const dests = sellDestinations.filter(d => {
      const path = findShortestPath(cityId, d.cityId, gameState.routes)
      return path !== null
    })
    if (dests.length === 0) return
    // Pick highest-value reachable destination
    const best = dests.sort((a, b) => b.sellPrice - a.sellPrice)[0]!
    const path = findShortestPath(cityId, best.cityId, gameState.routes)
    if (path) {
      setBuiltPath(path)
      setSelectedVehicleIds([])
      setVolume(0)
    }
  }, [cityId, sellDestinations, gameState.routes])

  // Step 3: vehicles
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([])

  const eligibleVehicles = useMemo(() => {
    if (builtPath.length < 2) return []
    return gameState.fleet.filter(v =>
      !v.isAssigned && !v.isImpounded &&
      canVehicleTraversePath(v.type, builtPath, gameState.routes),
    )
  }, [builtPath, gameState.fleet, gameState.routes])

  // Step 4: volume
  const commodity = commodityOptions.find(c => c.key === selectedCommodity)
  const maxInventory = commodity?.qty ?? 0
  const totalCapacity = selectedVehicleIds.reduce((sum, id) => {
    const v = gameState.fleet.find(f => f.id === id)
    return sum + (v?.capacity ?? 0)
  }, 0)
  const maxVolume = Math.min(maxInventory, totalCapacity)
  const [volume, setVolume] = useState(0)
  const effectiveVolume = volume === 0 && maxVolume > 0 ? maxVolume : Math.min(volume, maxVolume)

  const buyPrice = commodity?.buyPrice ?? 0

  // Build hop data for risk display
  const hopData = useMemo(() => {
    if (builtPath.length < 2) return []
    const selectedVehicles = selectedVehicleIds
      .map(id => gameState.fleet.find(v => v.id === id))
      .filter(Boolean) as Vehicle[]
    const minConcealment = selectedVehicles.length > 0
      ? Math.min(...selectedVehicles.map(v => v.upgrades.concealment)) as 0 | 1 | 2
      : 0 as const

    const activeLegitCount = gameState.shipmentsInTransit.filter(s =>
      !s.isIllicit && !s.smuggleRunId,
    ).length

    return builtPath.slice(1).map((destCity, i) => {
      const originCity = builtPath[i]!
      const route = findRouteBetween(originCity, destCity, gameState.routes)
      if (!route) return null

      const { prob, breakdown } = smuggleHopDetection({
        routeSegment: route,
        allRoutes: gameState.routes,
        globalHeat: gameState.globalHeat,
        arrivalCityId: destCity,
        inspectorCityId: gameState.inspector.currentCityId,
        interpolCityId: gameState.interpol.currentCityId,
        interpolAdditionalIds: gameState.interpol.additionalCityIds,
        unlockedSkills: gameState.unlockedSkills,
        minConcealmentTier: minConcealment,
        activeLegitRecurringCount: activeLegitCount,
        vehicleCount: selectedVehicleIds.length || 1,
        volume: effectiveVolume || 1,
      })

      return { origin: originCity, destination: destCity, route, prob, breakdown }
    }).filter(Boolean) as Array<{
      origin: string; destination: string; route: Route; prob: number
      breakdown: ReturnType<typeof smuggleHopDetection>['breakdown']
    }>
  }, [builtPath, selectedVehicleIds, effectiveVolume, gameState])

  const survivalProb = hopData.reduce((acc, h) => acc * (1 - h.prob), 1)

  const repReward = hopData.length > 0
    ? computeRepReward(hopData.map(h => ({ routeTier: h.route.tier })), effectiveVolume)
    : 0

  const canLaunch = isRouteComplete && selectedVehicleIds.length > 0 && effectiveVolume > 0

  function handleLaunch() {
    if (!canLaunch) return

    const config: SmuggleRunConfig = {
      sourceCity: cityId,
      destinationCity: lastCity,
      commodityKey: selectedCommodity,
      volume: effectiveVolume,
      path: builtPath,
      vehicleIds: selectedVehicleIds,
      sellPricePerUnit: sellPrice,
      repReward,
    }
    launchSmuggleRun(config)
    onClose()
  }

  const openRoutes = useMemo(() => gameState.routes.filter(r => r.status === 'open'), [gameState.routes])

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
      onWheel={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation() }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[90vw] max-w-[1100px] h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div>
            <div className="font-mono font-bold text-amber-400 text-lg">Plan Smuggling Run</div>
            <div className="font-mono text-xs text-gray-500">from {getCityName(cityId)}</div>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-lg font-mono">✕</button>
        </div>

        {/* Two-column layout: map (left) + controls (right) */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Route builder map */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Commodity bar + route controls */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                {commodityOptions.map(c => (
                  <button
                    key={c.key}
                    onClick={() => { setSelectedCommodity(c.key); setBuiltPath([cityId]); setSelectedVehicleIds([]); setVolume(0) }}
                    className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                      selectedCommodity === c.key
                        ? 'bg-amber-900/60 border-amber-600 text-amber-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {c.icon} {c.displayName} ({c.qty})
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-3">
                <span className="text-xs font-mono text-gray-500">
                  {builtPath.length > 1 ? `${builtPath.length - 1} hop${builtPath.length - 1 > 1 ? 's' : ''}` : 'Click a city'}
                </span>
                <button onClick={handleAuto}
                  className="text-xs font-mono px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 transition-colors">Auto</button>
                <button onClick={handleUndo} disabled={builtPath.length <= 1}
                  className="text-xs font-mono px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">Undo</button>
                <button onClick={handleClear} disabled={builtPath.length <= 1}
                  className="text-xs font-mono px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">Clear</button>
              </div>
            </div>

            {/* Map */}
            {selectedCommodity && (
              <div className="flex-1 relative">
                <RouteBuilderMap
                  sourceCity={cityId}
                  builtPath={builtPath}
                  openRoutes={openRoutes}
                  destinationCityIds={destinationCityIds}
                  inspectorCityId={gameState.inspector.currentCityId}
                  interpolCityId={gameState.interpol.currentCityId}
                  interpolAdditionalIds={gameState.interpol.additionalCityIds}
                  onCityClick={handleCityClick}
                />
              </div>
            )}

            {/* Route summary bar */}
            {builtPath.length > 1 && (
              <div className="flex items-center gap-1 flex-wrap px-4 py-2 border-t border-gray-800 text-xs font-mono shrink-0">
                {builtPath.map((city, i) => {
                  const hop = i > 0 ? hopData[i - 1] : null
                  const threatAtCity = city === gameState.inspector.currentCityId ||
                    city === gameState.interpol.currentCityId ||
                    gameState.interpol.additionalCityIds.includes(city)
                  return (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-gray-600">→</span>}
                      <span className={`px-1 py-0.5 rounded ${
                        threatAtCity ? 'bg-red-950/60 text-red-400 border border-red-900/40'
                          : i === builtPath.length - 1 && isRouteComplete ? 'bg-amber-950/60 text-amber-400'
                          : 'text-gray-300'
                      }`}>{getCityName(city)}</span>
                      {hop && <span className="text-red-400">{Math.round(hop.prob * 100)}%</span>}
                    </span>
                  )
                })}
                {isRouteComplete && <span className="text-emerald-500 ml-1">${sellPrice}/u</span>}
              </div>
            )}
          </div>

          {/* Right: Controls sidebar */}
          <div className="w-[280px] shrink-0 border-l border-gray-800 overflow-y-auto p-3 space-y-3">
            {/* Vehicle selection */}
            {isRouteComplete ? (
              <div>
                <label className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                  Vehicles ({selectedVehicleIds.length})
                </label>
                {eligibleVehicles.length === 0 ? (
                  <div className="text-xs font-mono text-gray-600 italic">No eligible vehicles.</div>
                ) : (
                  <div className="space-y-1.5">
                    {eligibleVehicles.map(v => {
                      const selected = selectedVehicleIds.includes(v.id)
                      return (
                        <button key={v.id}
                          onClick={() => {
                            if (selected) setSelectedVehicleIds(ids => ids.filter(id => id !== v.id))
                            else setSelectedVehicleIds(ids => [...ids, v.id])
                            setVolume(0)
                          }}
                          className={`w-full px-2 py-1.5 rounded text-xs font-mono border text-left transition-colors ${
                            selected ? 'bg-blue-900/40 border-blue-700 text-blue-300'
                              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                          }`}>
                          <div className="font-semibold">{VEHICLE_ICON[v.type]} {v.name}</div>
                          <div className="text-gray-500">Cap: {v.capacity} | Hide: T{v.upgrades.concealment}</div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs font-mono text-gray-600 italic py-4 text-center">
                Build a route on the map to a destination city (amber ring)
              </div>
            )}

            {/* Volume */}
            {selectedVehicleIds.length > 0 && maxVolume > 0 && (
              <div>
                <label className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider block mb-1">Volume</label>
                <div className="flex items-center gap-2">
                  <input type="range" min={1} max={maxVolume}
                    value={Math.min(effectiveVolume || 1, maxVolume)}
                    onChange={e => setVolume(Number(e.target.value))}
                    className="flex-1 accent-amber-500" />
                  <span className="text-xs font-mono text-white w-14 text-right">{effectiveVolume || 0}/{maxVolume}</span>
                </div>
              </div>
            )}

            {/* Risk */}
            {hopData.length > 0 && effectiveVolume > 0 && (
              <div className="bg-gray-800/60 rounded-lg p-2.5 space-y-1">
                <div className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Risk</div>
                {hopData.map((h, i) => (
                  <HopRiskRow key={i}
                    label={`${getCityName(h.origin)} → ${getCityName(h.destination)}`}
                    prob={h.prob} breakdown={h.breakdown} />
                ))}
                <div className="border-t border-gray-700 pt-1 flex justify-between text-xs font-mono">
                  <span className="text-gray-300">Success</span>
                  <span className="text-green-400">{Math.round(survivalProb * 100)}%</span>
                </div>
              </div>
            )}

            {/* Payout */}
            {isRouteComplete && effectiveVolume > 0 && (
              <div className="bg-gray-800/60 rounded-lg p-2.5 space-y-1">
                <div className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Payout</div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-gray-300">Revenue</span>
                  <span className="text-emerald-400 font-semibold">+${(effectiveVolume * sellPrice).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-gray-400">Rep</span>
                  <span className="text-blue-400">+{repReward}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-3 border-t border-gray-800">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 text-sm font-mono font-semibold transition-colors">
            Cancel
          </button>
          <button onClick={handleLaunch} disabled={!canLaunch}
            className={`flex-1 py-2 rounded-lg text-sm font-mono font-bold tracking-wide transition-all ${
              canLaunch
                ? 'bg-gradient-to-r from-amber-700 to-orange-700 hover:from-amber-600 hover:to-orange-600 border border-amber-600 text-amber-100'
                : 'bg-gray-800 border border-gray-700 text-gray-600 cursor-not-allowed'
            }`}>
            Launch Run
          </button>
        </div>
      </div>
    </div>
  )
}
