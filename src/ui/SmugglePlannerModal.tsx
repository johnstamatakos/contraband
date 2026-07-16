import { useState, useMemo } from 'react'
import { useGameStore, type SmuggleRunConfig } from '../store/gameStore'
import { CONFIG } from '../engine/config'
import { getCityName } from '../data/cities'
import { getSellDestinations } from '../data/commodities'
import { findShortestPath, findRouteBetween, canVehicleTraversePath } from '../engine/pathfinding'
import { smuggleHopDetection } from '../engine/detection'
import { VEHICLE_ICON } from './vehicleConstants'
import type { Vehicle, Route } from '../engine/gameState'

interface SmugglePlannerModalProps {
  cityId: string
  onClose: () => void
}

const TIER_COLORS: Record<string, string> = {
  domestic: 'text-green-400',
  regional: 'text-blue-400',
  international: 'text-purple-400',
  long_haul: 'text-red-400',
}

function computeRepReward(hops: { routeTier: string }[], volume: number): number {
  const rr = CONFIG.smuggling.repReward
  const maxTierRep = Math.max(...hops.map(h => rr.baseTierRep[h.routeTier] ?? 1))
  const hopMult = Math.min(rr.hopMultiplierCap, 1.0 + (hops.length - 1) * rr.hopMultiplierStep)
  const volMult = 1.0 + Math.min(rr.volumeMultiplierCap, Math.floor(volume / rr.volumeStepSize) * rr.volumeMultiplierStep)
  return Math.floor(maxTierRep * hopMult * volMult)
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

  // Step 2: destination selection
  const destinations = useMemo(() => {
    if (!selectedCommodity) return []
    return getSellDestinations(selectedCommodity)
      .filter(d => {
        // Must be reachable via open routes
        const path = findShortestPath(cityId, d.cityId, gameState.routes)
        return path !== null
      })
      .sort((a, b) => b.sellPrice - a.sellPrice)
  }, [selectedCommodity, cityId, gameState.routes])

  const [selectedDest, setSelectedDest] = useState('')

  // Step 3: route
  const autoPath = useMemo(() => {
    if (!selectedDest) return null
    return findShortestPath(cityId, selectedDest, gameState.routes)
  }, [cityId, selectedDest, gameState.routes])

  // Step 4: vehicles
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([])

  const eligibleVehicles = useMemo(() => {
    if (!autoPath || autoPath.length < 2) return []
    return gameState.fleet.filter(v =>
      !v.isAssigned && !v.isImpounded &&
      canVehicleTraversePath(v.type, autoPath, gameState.routes),
    )
  }, [autoPath, gameState.fleet, gameState.routes])

  // Step 5: volume
  const commodity = commodityOptions.find(c => c.key === selectedCommodity)
  const maxInventory = commodity?.qty ?? 0
  const totalCapacity = selectedVehicleIds.reduce((sum, id) => {
    const v = gameState.fleet.find(f => f.id === id)
    return sum + (v?.capacity ?? 0)
  }, 0)
  const maxVolume = Math.min(maxInventory, totalCapacity)
  const [volume, setVolume] = useState(0)
  // Default to max when volume hasn't been set yet
  const effectiveVolume = volume === 0 && maxVolume > 0 ? maxVolume : Math.min(volume, maxVolume)

  // Sell price
  const sellDest = destinations.find(d => d.cityId === selectedDest)
  const sellPrice = sellDest?.sellPrice ?? 0
  const buyPrice = commodity?.buyPrice ?? 0

  // Build hop data for risk display
  const hopData = useMemo(() => {
    if (!autoPath || autoPath.length < 2) return []
    const selectedVehicles = selectedVehicleIds
      .map(id => gameState.fleet.find(v => v.id === id))
      .filter(Boolean) as Vehicle[]
    const minConcealment = selectedVehicles.length > 0
      ? Math.min(...selectedVehicles.map(v => v.upgrades.concealment)) as 0 | 1 | 2
      : 0 as const

    const activeLegitCount = gameState.shipmentsInTransit.filter(s =>
      !s.isIllicit && !s.smuggleRunId,
    ).length

    return autoPath.slice(1).map((destCity, i) => {
      const originCity = autoPath[i]!
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
        vehicleCount: selectedVehicleIds.length,
        volume: effectiveVolume,
      })

      return {
        origin: originCity,
        destination: destCity,
        route,
        prob,
        breakdown,
      }
    }).filter(Boolean) as Array<{
      origin: string
      destination: string
      route: Route
      prob: number
      breakdown: ReturnType<typeof smuggleHopDetection>['breakdown']
    }>
  }, [autoPath, selectedVehicleIds, effectiveVolume, gameState])

  // Cumulative survival
  const survivalProb = hopData.reduce((acc, h) => acc * (1 - h.prob), 1)
  const cumulativeRisk = 1 - survivalProb

  // Rep reward
  const repReward = hopData.length > 0
    ? computeRepReward(hopData.map(h => ({ routeTier: h.route.tier })), effectiveVolume)
    : 0

  // Can launch?
  const canLaunch = selectedCommodity && selectedDest && autoPath && autoPath.length >= 2 &&
    selectedVehicleIds.length > 0 && effectiveVolume > 0

  function handleLaunch() {
    if (!canLaunch || !autoPath) return

    const config: SmuggleRunConfig = {
      sourceCity: cityId,
      destinationCity: selectedDest,
      commodityKey: selectedCommodity,
      volume: effectiveVolume,
      path: autoPath,
      vehicleIds: selectedVehicleIds,
      sellPricePerUnit: sellPrice,
      repReward,
    }
    launchSmuggleRun(config)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[540px] max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <div className="font-mono font-bold text-amber-400 text-lg">Plan Smuggling Run</div>
            <div className="font-mono text-xs text-gray-500">from {getCityName(cityId)}</div>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-lg font-mono">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Commodity selection */}
          <div>
            <label className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider block mb-1">
              Commodity
            </label>
            <div className="flex gap-2 flex-wrap">
              {commodityOptions.map(c => (
                <button
                  key={c.key}
                  onClick={() => { setSelectedCommodity(c.key); setSelectedDest(''); setSelectedVehicleIds([]); setVolume(0) }}
                  className={`px-3 py-1.5 rounded text-sm font-mono border transition-colors ${
                    selectedCommodity === c.key
                      ? 'bg-amber-900/60 border-amber-600 text-amber-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {c.icon} {c.displayName} ({c.qty})
                </button>
              ))}
            </div>
          </div>

          {/* Destination selection */}
          {selectedCommodity && (
            <div>
              <label className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                Deliver to
              </label>
              {destinations.length === 0 ? (
                <div className="text-xs font-mono text-gray-600 italic">No reachable destinations. Expand your route network.</div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                  {destinations.map(d => {
                    const margin = d.sellPrice - buyPrice
                    return (
                      <button
                        key={d.cityId}
                        onClick={() => { setSelectedDest(d.cityId); setSelectedVehicleIds([]); setVolume(0) }}
                        className={`px-2 py-1.5 rounded text-xs font-mono border text-left transition-colors ${
                          selectedDest === d.cityId
                            ? 'bg-amber-900/40 border-amber-700 text-amber-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <div className="font-semibold">{getCityName(d.cityId)}</div>
                        <div className="text-emerald-500">${d.sellPrice}/u <span className="text-gray-600">(+${margin})</span></div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Route display */}
          {autoPath && autoPath.length >= 2 && (
            <div>
              <label className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                Route ({autoPath.length - 1} hop{autoPath.length - 1 > 1 ? 's' : ''})
              </label>
              <div className="flex items-center gap-1 flex-wrap bg-gray-800/50 rounded p-2">
                {autoPath.map((city, i) => {
                  const hop = i > 0 ? hopData[i - 1] : null
                  const threatAtCity = city === gameState.inspector.currentCityId ||
                    city === gameState.interpol.currentCityId ||
                    gameState.interpol.additionalCityIds.includes(city)

                  return (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && (
                        <span className="text-gray-600 text-xs">→</span>
                      )}
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        threatAtCity
                          ? 'bg-red-950/60 text-red-400 border border-red-900/40'
                          : 'bg-gray-700/60 text-gray-300'
                      }`}>
                        {getCityName(city)}
                      </span>
                      {hop && (
                        <span className={`text-xs font-mono ${
                          hop.prob >= 0.3 ? 'text-red-400' : hop.prob >= 0.15 ? 'text-orange-400' : 'text-gray-500'
                        }`}>
                          {Math.round(hop.prob * 100)}%
                        </span>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Vehicle selection */}
          {autoPath && autoPath.length >= 2 && (
            <div>
              <label className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                Vehicles ({selectedVehicleIds.length} selected)
              </label>
              {eligibleVehicles.length === 0 ? (
                <div className="text-xs font-mono text-gray-600 italic">
                  No eligible vehicles. All vehicles must be able to traverse the entire route.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                  {eligibleVehicles.map(v => {
                    const selected = selectedVehicleIds.includes(v.id)
                    return (
                      <button
                        key={v.id}
                        onClick={() => {
                          if (selected) {
                            setSelectedVehicleIds(ids => ids.filter(id => id !== v.id))
                          } else {
                            setSelectedVehicleIds(ids => [...ids, v.id])
                          }
                          setVolume(0)
                        }}
                        className={`px-2 py-1.5 rounded text-xs font-mono border text-left transition-colors ${
                          selected
                            ? 'bg-blue-900/40 border-blue-700 text-blue-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <div className="font-semibold">{VEHICLE_ICON[v.type]} {v.name}</div>
                        <div className="text-gray-500">
                          Cap: {v.capacity} | Hide: T{v.upgrades.concealment}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Volume selection */}
          {selectedVehicleIds.length > 0 && maxVolume > 0 && (
            <div>
              <label className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                Volume
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={maxVolume}
                  value={Math.min(effectiveVolume || 1, maxVolume)}
                  onChange={e => setVolume(Number(e.target.value))}
                  className="flex-1 accent-amber-500"
                />
                <span className="text-sm font-mono text-white w-16 text-right">
                  {effectiveVolume || 0} / {maxVolume}
                </span>
              </div>
              <div className="flex justify-between text-xs font-mono text-gray-600 mt-0.5">
                <span>Inventory: {maxInventory}</span>
                <span>Capacity: {totalCapacity}</span>
              </div>
            </div>
          )}

          {/* Risk & Payout summary */}
          {hopData.length > 0 && effectiveVolume > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {/* Risk panel */}
              <div className="bg-gray-800/60 rounded-lg p-3 space-y-1.5">
                <div className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Risk</div>
                {hopData.map((h, i) => (
                  <div key={i} className="flex justify-between text-xs font-mono">
                    <span className="text-gray-400 truncate">
                      {getCityName(h.origin)} → {getCityName(h.destination)}
                    </span>
                    <span className={
                      h.prob >= 0.3 ? 'text-red-400' : h.prob >= 0.15 ? 'text-orange-400' : 'text-green-400'
                    }>
                      {Math.round(h.prob * 100)}%
                    </span>
                  </div>
                ))}
                <div className="border-t border-gray-700 pt-1 flex justify-between text-xs font-mono">
                  <span className="text-gray-300">Success chance</span>
                  <span className={
                    survivalProb >= 0.7 ? 'text-green-400' : survivalProb >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                  }>
                    {Math.round(survivalProb * 100)}%
                  </span>
                </div>
              </div>

              {/* Payout panel */}
              <div className="bg-gray-800/60 rounded-lg p-3 space-y-1.5">
                <div className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Payout</div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-gray-400">Revenue</span>
                  <span className="text-emerald-400">${(effectiveVolume * sellPrice).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-gray-400">Cost (paid)</span>
                  <span className="text-gray-500">${(effectiveVolume * buyPrice).toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-700 pt-1 flex justify-between text-xs font-mono">
                  <span className="text-gray-300">Profit</span>
                  <span className="text-emerald-400 font-semibold">
                    ${((effectiveVolume * sellPrice) - (effectiveVolume * buyPrice)).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-gray-400">Rep reward</span>
                  <span className="text-blue-400">+{repReward}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 text-sm font-mono font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLaunch}
            disabled={!canLaunch}
            className={`flex-1 py-2 rounded-lg text-sm font-mono font-bold tracking-wide transition-all ${
              canLaunch
                ? 'bg-gradient-to-r from-amber-700 to-orange-700 hover:from-amber-600 hover:to-orange-600 border border-amber-600 text-amber-100'
                : 'bg-gray-800 border border-gray-700 text-gray-600 cursor-not-allowed'
            }`}
          >
            Launch Run
          </button>
        </div>
      </div>
    </div>
  )
}
