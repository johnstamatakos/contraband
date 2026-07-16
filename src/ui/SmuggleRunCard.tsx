import { useGameStore } from '../store/gameStore'
import type { SmuggleRun } from '../engine/gameState'
import { getCityName } from '../data/cities'
import { CONFIG } from '../engine/config'
import { DAY_MS } from '../engine/constants'

export function SmuggleRunCard({ run, now }: { run: SmuggleRun; now: number }) {
  const { gameState } = useGameStore()
  const eu = CONFIG.vehicleUpgrades.effects.engine
  const skillSpeedMult = gameState.unlockedSkills.includes('logistics_2')
    ? CONFIG.skills.effects.logistics_2.transitTimeMultiplier
    : 1.0

  const commodityDef = CONFIG.smuggling.commodities[run.commodityKey as keyof typeof CONFIG.smuggling.commodities]
  const icon = commodityDef?.icon ?? '📦'
  const name = commodityDef?.displayName ?? run.commodityKey

  const currentHop = run.hops[run.currentHopIndex]
  const activeShipment = currentHop
    ? gameState.shipmentsInTransit.find(s => currentHop.shipmentIds.includes(s.id))
    : null

  let progress = 0
  let daysLeft = 0
  let isFrozen = false
  if (activeShipment) {
    const vehicle = gameState.fleet.find(v => v.id === activeShipment.vehicleId)
    const engineTier = vehicle?.upgrades.engine ?? 0
    const engineMult = engineTier === 2 ? eu.tier2TransitMultiplier
      : engineTier === 1 ? eu.tier1TransitMultiplier : 1.0
    const arrivalMs = activeShipment.departureTimeMs
      + activeShipment.totalTurns * DAY_MS * skillSpeedMult * engineMult
      + activeShipment.frozenDurationMs
    const duration = arrivalMs - activeShipment.departureTimeMs
    progress = duration > 0 ? Math.min(1, Math.max(0, (now - activeShipment.departureTimeMs) / duration)) : 1
    daysLeft = Math.max(0, Math.ceil((arrivalMs - now) / DAY_MS))
    isFrozen = activeShipment.isFrozen
  }

  const isDone = run.status === 'completed'
  const isBusted = run.status === 'busted'

  return (
    <div className={`rounded-lg border px-2.5 py-2.5 space-y-2 ${
      isBusted ? 'border-red-900/60 bg-red-950/30'
        : isDone ? 'border-green-900/40 bg-green-950/20'
        : 'border-amber-900/40 bg-gray-950'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-white truncate">{icon} {name} ×{run.volume}</span>
        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
          isBusted ? 'bg-red-900/80 text-red-300' : isDone ? 'bg-green-900/60 text-green-400' : 'bg-amber-900/60 text-amber-400'
        }`}>
          {isBusted ? 'BUSTED' : isDone ? 'DELIVERED' : 'SMUGGLING'}
        </span>
      </div>

      <div className="flex items-center gap-0.5 flex-wrap text-xs font-mono">
        {run.hops.map((hop, i) => {
          const isActive = i === run.currentHopIndex && run.status === 'in_transit'
          const isCleared = hop.status === 'cleared'
          const hopBusted = hop.status === 'busted'
          return (
            <span key={i} className="flex items-center gap-0.5">
              {i === 0 && <span className="text-gray-400 px-0.5">{getCityName(hop.origin)}</span>}
              <span className={`px-0.5 ${isCleared ? 'text-green-500' : hopBusted ? 'text-red-400' : isActive ? 'text-amber-400' : 'text-gray-700'}`}>
                {isCleared ? '✓' : hopBusted ? '✗' : isActive ? '►' : '○'}
              </span>
              <span className="text-gray-600">→</span>
              <span className={`px-0.5 ${isCleared ? 'text-green-500' : hopBusted ? 'text-red-400' : isActive ? 'text-amber-300' : 'text-gray-500'}`}>
                {getCityName(hop.destination)}
              </span>
            </span>
          )
        })}
      </div>

      {run.status === 'in_transit' && activeShipment && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-gray-400">{run.vehicleIds.length} vehicle{run.vehicleIds.length > 1 ? 's' : ''}</span>
            {isFrozen ? <span className="text-amber-500">DELAYED</span> : <span className="text-gray-500">ETA {daysLeft}d</span>}
          </div>
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div className={`h-full rounded-full ${isFrozen ? 'bg-amber-600' : 'bg-amber-500'}`} style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="text-xs font-mono text-gray-600">
        {isDone ? <span className="text-emerald-500">+${run.expectedPayout.toLocaleString()} delivered</span>
          : isBusted ? <span className="text-red-500">Cargo seized</span>
          : <span>${run.expectedPayout.toLocaleString()} on delivery · +{run.repReward} rep</span>}
      </div>
    </div>
  )
}
