import { useGameStore } from '../store/gameStore'
import type { Contract, VehicleType } from '../engine/gameState'
import { CITY_MAP } from '../data/cities'
import { VEHICLE_ICON } from './vehicleConstants'
import { CONFIG } from '../engine/config'

const UPGRADE_ICON: Record<string, string> = {
  range: '⛽', concealment: '🫥', cargo: '📦', engine: '⚙️',
}

export function AvailableCard({ contract, onOpen, onDecline }: {
  contract: Contract
  onOpen: () => void
  onDecline: () => void
}) {
  const { gameState } = useGameStore()

  const originCity = CITY_MAP.get(contract.origin)
  const destCity   = CITY_MAP.get(contract.destination)
  if (!originCity || !destCity) return null

  const primaryRoute = gameState.routes.find(r =>
    r.status === 'open' &&
    r.origin === contract.legs[0]!.origin &&
    r.destination === contract.legs[0]!.destination,
  )
  const perVehicleVolume = contract.volume
  const feasibleVehicles: VehicleType[] = primaryRoute
    ? primaryRoute.allowedVehicles.filter(vt => CONFIG.vehicles[vt].capacity >= perVehicleVolume)
    : []

  const isMultiLeg   = contract.legs.length > 1
  const isIndefinite = contract.isRecurring && contract.totalRuns >= 999
  const hasReqs      = Object.keys(contract.vehicleRequirements).length > 0
  const skillsLocked = contract.requiredSkills.some(s => !gameState.unlockedSkills.includes(s))

  const deadlineUrgent = !isIndefinite && contract.deadline <= 1
  const deadlineWarn   = !isIndefinite && contract.deadline <= 2

  return (
    <div className="relative rounded-lg border transition-colors border-gray-700/60 bg-gray-900 hover:bg-gray-800 hover:border-gray-600">
      <button onClick={onOpen} className="w-full text-left px-2.5 pt-2.5 pb-2 pr-8 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold text-white truncate">
            {originCity.name} → {destCity.name}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {isMultiLeg && (
              <span className="text-xs font-mono px-1 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-900">{contract.legs.length}-LEG</span>
            )}
            <span className="text-sm font-mono font-bold text-emerald-400">
              ${contract.payout.toLocaleString()}{contract.isRecurring ? '/run' : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-gray-400">
            {feasibleVehicles.map(v => VEHICLE_ICON[v]).join(' ') || '—'}
          </span>
          <span className="text-gray-700">·</span>
          <span className={deadlineUrgent ? 'text-red-400' : deadlineWarn ? 'text-yellow-500' : 'text-gray-500'}>
            {isIndefinite ? '∞' : `${contract.deadline}w`}
          </span>
          {isMultiLeg && (<><span className="text-gray-700">·</span><span className="text-gray-500">{contract.legs.length} legs</span></>)}
          {contract.isRecurring && (<><span className="text-gray-700">·</span><span className="text-violet-400">∞ recurring</span></>)}
        </div>
        {(hasReqs || skillsLocked) && (
          <div className="text-xs font-mono">
            {skillsLocked
              ? <span className="text-red-500">🔒 Skill required</span>
              : <span className="text-amber-600">{Object.keys(contract.vehicleRequirements).map(k => UPGRADE_ICON[k] ?? '').join(' ')} Upgrade required</span>
            }
          </div>
        )}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDecline() }}
        title="Decline"
        className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded text-gray-700 hover:text-gray-300 hover:bg-gray-700 transition-colors text-xs leading-none"
      >✕</button>
    </div>
  )
}
