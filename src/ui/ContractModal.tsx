import { useGameStore } from '../store/gameStore'
import type { Contract, ContractLeg, Vehicle } from '../engine/gameState'
import { CITY_MAP } from '../data/cities'
import { VEHICLE_ICON } from './vehicleConstants'
import { SKILL_BY_ID } from '../data/skills'
import { CONFIG } from '../engine/config'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UPGRADE_LABEL: Record<string, string> = {
  range: 'Fuel Tank',
  concealment: 'Concealment',
  cargo: 'Cargo Hold',
  engine: 'Engine',
}

const TIER_LABEL = ['—', 'T1', 'T2']

function reqLabel(key: string, tier: 1 | 2): string {
  return `${UPGRADE_LABEL[key] ?? key} ${TIER_LABEL[tier]} required`
}

// ─── Leg card ──────────────────────────────────────────────────────────────────

interface LegCardProps {
  leg: ContractLeg
  legIndex: number
  legCount: number
  contract: Contract
  onAssign: (legIndex: number, vehicleId: string) => void
}

function LegCard({ leg, legIndex, legCount, contract, onAssign }: LegCardProps) {
  const { gameState } = useGameStore()

  const originCity = CITY_MAP.get(leg.origin)
  const destCity   = CITY_MAP.get(leg.destination)

  const route = gameState.routes.find(r =>
    r.status === 'open' &&
    r.origin === leg.origin &&
    r.destination === leg.destination,
  )

  const isDispatched = leg.shipmentIds.length > 0
  const isComplete   = leg.completedAt !== null
  const isAssigned   = leg.assignedVehicleIds.length >= contract.requiredVehicleCount

  // Vehicle types that can both traverse the route AND carry the contract volume
  const perVehicleVolume = Math.ceil(contract.volume / contract.requiredVehicleCount)
  const viableTypes = route
    ? route.allowedVehicles.filter(vType => {
        const cap = CONFIG.vehicles[vType as keyof typeof CONFIG.vehicles]?.capacity ?? 0
        return cap >= perVehicleVolume
      })
    : []

  // Vehicles eligible for this leg
  const reqs = contract.vehicleRequirements
  const eligibleVehicles: Vehicle[] = route
    ? gameState.fleet.filter(v =>
        !v.isAssigned &&
        !v.isImpounded &&
        route.allowedVehicles.includes(v.type) &&
        v.capacity >= Math.ceil(contract.volume / contract.requiredVehicleCount) &&
        (!reqs.range || v.upgrades.range >= reqs.range) &&
        (!reqs.concealment || v.upgrades.concealment >= reqs.concealment) &&
        (!reqs.cargo || v.upgrades.cargo >= reqs.cargo) &&
        (!reqs.engine || v.upgrades.engine >= reqs.engine) &&
        !leg.assignedVehicleIds.includes(v.id),
      )
    : []

  // Why can't we assign?
  let blockedReason: string | null = null
  if (!isAssigned && !isDispatched && !isComplete) {
    if (!route) {
      blockedReason = 'Route not established'
    } else if (eligibleVehicles.length === 0) {
      // Check why
      const typeOk = route ? gameState.fleet.filter(v =>
        !v.isAssigned && !v.isImpounded && route.allowedVehicles.includes(v.type),
      ) : []
      if (typeOk.length === 0) {
        blockedReason = 'No compatible idle vehicles'
      } else {
        // Which requirements are failing?
        const missing: string[] = []
        if (reqs.range && typeOk.every(v => v.upgrades.range < (reqs.range ?? 0))) {
          missing.push(`Fuel Tank T${reqs.range}`)
        }
        if (reqs.concealment && typeOk.every(v => v.upgrades.concealment < (reqs.concealment ?? 0))) {
          missing.push(`Concealment T${reqs.concealment}`)
        }
        if (reqs.cargo && typeOk.every(v => v.upgrades.cargo < (reqs.cargo ?? 0))) {
          missing.push(`Cargo T${reqs.cargo}`)
        }
        if (missing.length > 0) {
          blockedReason = `Vehicle needs: ${missing.join(', ')}`
        } else {
          blockedReason = 'All idle vehicles are too small or incompatible'
        }
      }
    }
  }

  const needsMoreVehicles = isAssigned
    ? false
    : leg.assignedVehicleIds.length < contract.requiredVehicleCount

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${
      isComplete ? 'border-green-900/40 bg-green-950/20' :
      isDispatched ? 'border-yellow-900/40 bg-yellow-950/10' :
      isAssigned ? 'border-blue-900/40 bg-blue-950/10' :
      'border-gray-700/60 bg-gray-800/50'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {legCount > 1 && (
            <span className="text-xs font-mono text-gray-500 shrink-0">
              Leg {legIndex + 1}
            </span>
          )}
          <span className="text-sm font-mono font-semibold text-white">
            {originCity?.name} → {destCity?.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {viableTypes.length > 0 && (
            <span className="text-xs font-mono text-gray-500">
              {viableTypes.map(v => VEHICLE_ICON[v]).join('')}
            </span>
          )}
          {isComplete && <span className="text-xs font-mono text-green-400 bg-green-900/40 px-1.5 py-0.5 rounded">DONE</span>}
          {isDispatched && !isComplete && <span className="text-xs font-mono text-yellow-400 bg-yellow-900/40 px-1.5 py-0.5 rounded">EN ROUTE</span>}
          {!isDispatched && !isComplete && isAssigned && <span className="text-xs font-mono text-blue-400 bg-blue-900/40 px-1.5 py-0.5 rounded">ASSIGNED</span>}
        </div>
      </div>

      {/* Travel times — only for vehicle types that can carry the volume */}
      {route && viableTypes.length > 0 && (
        <div className="flex gap-3 text-xs font-mono text-gray-500">
          {viableTypes.map(vType => {
            const days = route.travelDays[vType as keyof typeof route.travelDays]
            return days != null ? (
              <span key={vType}>{VEHICLE_ICON[vType as keyof typeof VEHICLE_ICON]} {days}d</span>
            ) : null
          })}
        </div>
      )}

      {/* Assigned vehicles */}
      {leg.assignedVehicleIds.length > 0 && (
        <div className="space-y-1">
          {leg.assignedVehicleIds.map(vid => {
            const v = gameState.fleet.find(f => f.id === vid)
            if (!v) return null
            return (
              <div key={vid} className="flex items-center gap-1.5 text-xs font-mono">
                <span>{VEHICLE_ICON[v.type]}</span>
                <span className="text-yellow-400">{v.name}</span>
                {isDispatched && <span className="text-gray-600">· in transit</span>}
                {!isDispatched && <span className="text-blue-400">· reserved</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Vehicle assignment — always visible when leg needs a vehicle */}
      {!isDispatched && !isComplete && needsMoreVehicles && (
        blockedReason ? (
          <div className="text-xs font-mono text-gray-600 py-1">{blockedReason}</div>
        ) : (
          <div className="space-y-1.5">
            <div className="text-xs font-mono text-gray-500">Assign vehicle:</div>
            <div className="grid grid-cols-2 gap-1.5">
              {eligibleVehicles.map(v => {
                const days = route?.travelDays[v.type]
                return (
                  <button
                    key={v.id}
                    onClick={() => onAssign(legIndex, v.id)}
                    className="flex flex-col items-start px-2.5 py-2 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-gray-500 text-xs font-mono text-left transition-colors"
                  >
                    <span className="flex items-center gap-1 w-full min-w-0">
                      <span>{VEHICLE_ICON[v.type]}</span>
                      <span className="text-white font-semibold truncate">{v.name}</span>
                    </span>
                    <span className="text-gray-400 mt-0.5">
                      {v.capacity} cap{days ? ` · ${days}d` : ''}
                    </span>
                  </button>
                )
              })}
              {eligibleVehicles.length === 0 && (
                <div className="col-span-2 text-xs font-mono text-gray-600 py-1">
                  No eligible idle vehicles
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  contract: Contract
  onClose: () => void
}

export function ContractModal({ contract: contractProp, onClose }: Props) {
  const { gameState, assignVehicle, cancelContract, declineContract, cancelRecurringContract } = useGameStore()

  // Read the live contract from the store so the UI updates after assignment
  const contract = gameState.contracts.find(c => c.id === contractProp.id) ?? contractProp

  const originCity = CITY_MAP.get(contract.origin)
  const destCity   = CITY_MAP.get(contract.destination)

  const isMultiLeg = contract.legs.length > 1
  const isIndefinite = contract.isRecurring && contract.totalRuns >= 999

  // Skill requirement check
  const skillsLocked = contract.requiredSkills.some(s => !gameState.unlockedSkills.includes(s))

  const handleAssign = (legIndex: number, vehicleId: string) => {
    assignVehicle(contract.id, vehicleId, legIndex)
    // Auto-close once all legs have their required vehicles assigned
    const updated = useGameStore.getState().gameState.contracts.find(c => c.id === contract.id)
    if (updated && updated.legs.every(leg => leg.assignedVehicleIds.length >= updated.requiredVehicleCount)) {
      onClose()
    }
  }

  const handleDecline = () => {
    if (contract.isRecurring && contract.isAssigned) {
      cancelRecurringContract(contract.id)
    } else if (contract.isAssigned) {
      cancelContract(contract.id)
    } else {
      declineContract(contract.id)
    }
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4">
        <div className="pointer-events-auto bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-700 flex items-start justify-between gap-3 rounded-t-xl">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-mono font-bold text-white">
                  {originCity?.name} → {destCity?.name}
                </span>
                {isMultiLeg && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-blue-900 text-blue-300 border border-blue-700">
                    MULTI-LEG
                  </span>
                )}
                {contract.isRecurring && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-violet-950 text-violet-300 border border-violet-800">∞</span>
                )}
              </div>
              <div className="text-xs font-mono text-gray-500 mt-0.5">{contract.cargoType}</div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none shrink-0">✕</button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 p-4 space-y-4">

            {/* Payout + stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-800 rounded-lg px-3 py-2">
                <div className="text-xs font-mono text-gray-500 mb-0.5">Payout</div>
                <div className="text-sm font-mono font-bold text-emerald-400">
                  ${contract.payout.toLocaleString()}
                  {contract.isRecurring ? '/run' : ''}
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg px-3 py-2">
                <div className="text-xs font-mono text-gray-500 mb-0.5">Volume</div>
                <div className="text-sm font-mono font-bold text-white">
                  {contract.volume} units
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg px-3 py-2">
                <div className="text-xs font-mono text-gray-500 mb-0.5">
                  {contract.isAssigned ? 'Status' : 'Deadline'}
                </div>
                <div className={`text-sm font-mono font-bold ${
                  contract.isAssigned ? 'text-yellow-400' :
                  contract.deadline <= 1 ? 'text-red-400' :
                  contract.deadline <= 2 ? 'text-yellow-400' : 'text-white'
                }`}>
                  {contract.isAssigned
                    ? isIndefinite ? '∞ recurring' : `${contract.runsCompleted}/${contract.totalRuns} runs`
                    : isIndefinite ? '∞ recurring'
                    : `${contract.deadline}w left`}
                </div>
              </div>
            </div>

            {/* Rep reward */}
            {contract.repReward && (
              <div className="flex items-center gap-1.5 text-xs font-mono text-gray-500">
                <span className="text-amber-400">+{contract.repReward} rep</span>
                <span>on completion</span>
              </div>
            )}

            {/* Vehicle requirements */}
            {Object.keys(contract.vehicleRequirements).length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-widest">Vehicle Requirements</div>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.entries(contract.vehicleRequirements) as [string, 1 | 2][]).map(([key, tier]) => {
                    const playerHas = gameState.fleet.some(v =>
                      !v.isImpounded &&
                      (v.upgrades[key as keyof typeof v.upgrades] ?? 0) >= tier,
                    )
                    return (
                      <span key={key} className={`text-xs font-mono px-2 py-0.5 rounded border ${
                        playerHas
                          ? 'bg-green-950/40 border-green-800 text-green-400'
                          : 'bg-red-950/40 border-red-800 text-red-400'
                      }`}>
                        {reqLabel(key, tier)} {playerHas ? '✓' : '✗'}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Skill requirements */}
            {contract.requiredSkills.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-widest">Skill Requirements</div>
                <div className="flex flex-wrap gap-1.5">
                  {contract.requiredSkills.map(skillId => {
                    const skill = SKILL_BY_ID.get(skillId)
                    const unlocked = gameState.unlockedSkills.includes(skillId)
                    return (
                      <span key={skillId} className={`text-xs font-mono px-2 py-0.5 rounded border ${
                        unlocked
                          ? 'bg-green-950/40 border-green-800 text-green-400'
                          : 'bg-red-950/40 border-red-800 text-red-400'
                      }`}>
                        {skill?.name ?? skillId} {unlocked ? '✓' : '— unlock in Skills'}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Legs */}
            <div className="space-y-2">
              {isMultiLeg && (
                <div className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-widest">Route Legs</div>
              )}
              {skillsLocked ? (
                <div className="border border-red-900/60 rounded-lg p-3 text-xs font-mono text-red-400">
                  This contract requires skills you haven't unlocked yet. Visit the Skills tab.
                </div>
              ) : (
                contract.legs.map((leg, i) => (
                  <LegCard
                    key={i}
                    leg={leg}
                    legIndex={i}
                    legCount={contract.legs.length}
                    contract={contract}
                    onAssign={handleAssign}
                  />
                ))
              )}
            </div>

          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-700 flex gap-2">
            {!contract.isAssigned ? (
              <button
                onClick={handleDecline}
                className="flex-1 text-xs font-mono py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
              >
                Decline
              </button>
            ) : (
              <button
                onClick={handleDecline}
                className="flex-1 text-xs font-mono py-2 rounded bg-red-950 hover:bg-red-900 text-red-400 border border-red-800 transition-colors"
              >
                {contract.isRecurring ? 'Cancel Recurring' : 'Cancel Contract'}
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 text-xs font-mono py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              Close
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
