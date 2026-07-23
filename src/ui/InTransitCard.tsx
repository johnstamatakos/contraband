import { useGameStore } from '../store/gameStore'
import type { Contract } from '../engine/gameState'
import { CITY_MAP, getCityName } from '../data/cities'
import { VEHICLE_ICON } from './vehicleConstants'
import { CONFIG } from '../engine/config'
import { DAY_MS } from '../engine/constants'

export function InTransitCard({ contract, now, onOpen }: {
  contract: Contract
  now: number
  onOpen: () => void
}) {
  const { gameState } = useGameStore()
  const eu = CONFIG.vehicleUpgrades.effects.engine
  const skillSpeedMult = gameState.unlockedSkills.includes('logistics_2')
    ? CONFIG.skills.effects.logistics_2.transitTimeMultiplier
    : 1.0

  const isMultiLeg = contract.legs.length > 1

  const legDisplays = contract.legs.map((leg, i) => {
    const isComplete = leg.completedAt !== null
    const activeShipments = gameState.shipmentsInTransit.filter(
      s => s.contractId === contract.id && s.legIndex === i,
    )
    const firstShipment = activeShipments[0] ?? null
    const primaryVehicle = firstShipment
      ? gameState.fleet.find(v => v.id === firstShipment.vehicleId)
      : leg.assignedVehicleIds[0]
        ? gameState.fleet.find(v => v.id === leg.assignedVehicleIds[0])
        : null

    let progress = 0
    let daysLeft = 0
    let isFrozen = false

    if (firstShipment) {
      const engineTier = primaryVehicle?.upgrades.engine ?? 0
      const engineMult = engineTier === 2 ? eu.tier2TransitMultiplier
        : engineTier === 1 ? eu.tier1TransitMultiplier : 1.0
      const arrivalMs = firstShipment.departureTimeMs
        + firstShipment.totalTurns * DAY_MS * skillSpeedMult * engineMult
        + firstShipment.frozenDurationMs
      const duration = arrivalMs - firstShipment.departureTimeMs
      progress = duration > 0 ? Math.min(1, Math.max(0, (now - firstShipment.departureTimeMs) / duration)) : 1
      daysLeft = Math.max(0, Math.ceil((arrivalMs - now) / DAY_MS))
      isFrozen = firstShipment.isFrozen
    }

    return { leg, i, isComplete, firstShipment, primaryVehicle, progress, daysLeft, isFrozen }
  })

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-lg border px-2.5 py-2.5 space-y-2 transition-colors border-gray-700/40 bg-gray-900 hover:bg-gray-800"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-white truncate">
          {isMultiLeg
            ? [...contract.legs.map(l => getCityName(l.origin)), getCityName(contract.legs[contract.legs.length - 1]!.destination)].join(' → ')
            : `${CITY_MAP.get(contract.origin)?.name} → ${CITY_MAP.get(contract.destination)?.name}`
          }
        </span>
        {isMultiLeg && (
          <span className="text-xs font-mono px-1 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-900">{contract.legs.length}-LEG</span>
        )}
      </div>

      {legDisplays.map(({ leg, i, isComplete, firstShipment, primaryVehicle, progress, daysLeft, isFrozen }) => {
        if (isComplete) return (
          <div key={i} className="space-y-1">
            {isMultiLeg && <div className="text-xs font-mono text-gray-600">Leg {i + 1}</div>}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-green-900/30"><div className="h-full w-full rounded-full bg-green-700/70" /></div>
              <span className="text-xs font-mono text-green-500 shrink-0">DONE ✓</span>
            </div>
          </div>
        )
        if (firstShipment) return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="flex items-center gap-1.5 text-gray-400 min-w-0">
                {isMultiLeg && <span className="text-gray-600 shrink-0">Leg {i + 1}</span>}
                {primaryVehicle && <span className="truncate">{VEHICLE_ICON[primaryVehicle.type]} {primaryVehicle.name}</span>}
              </span>
              {isFrozen ? <span className="text-amber-500 shrink-0">DELAYED</span> : <span className="text-gray-500 shrink-0">ETA {daysLeft}d</span>}
            </div>
            <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <div className={`h-full rounded-full ${isFrozen ? 'bg-amber-600' : 'bg-blue-600'}`} style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        )
        if (leg.assignedVehicleIds.length > 0) return (
          <div key={i} className="text-xs font-mono text-gray-700">
            {isMultiLeg && `Leg ${i + 1}: `}
            {primaryVehicle && `${VEHICLE_ICON[primaryVehicle.type]} ${primaryVehicle.name}`}
            {isMultiLeg ? ` — awaiting leg ${i}` : ' — dispatching...'}
          </div>
        )
        return null
      })}

      <div className="text-xs font-mono text-gray-600 pt-0.5">
        ${contract.payout.toLocaleString()} on delivery
        {contract.isRecurring && <span> · Run {contract.runsCompleted + 1}</span>}
      </div>
    </button>
  )
}
