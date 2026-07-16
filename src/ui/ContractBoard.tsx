import { useState, useEffect } from 'react'
import { useGameStore, currentGameTimeMs } from '../store/gameStore'
import type { Contract, VehicleType } from '../engine/gameState'
import { CITY_MAP, getCityName } from '../data/cities'
import { VEHICLE_ICON } from './vehicleConstants'
import { ContractModal } from './ContractModal'
import { CONFIG } from '../engine/config'
import { DAY_MS } from '../engine/constants'

type SubNav = 'available' | 'in-transit'
type Filter = 'all' | 'legit' | 'illicit'

const UPGRADE_ICON: Record<string, string> = {
  range: '⛽', concealment: '🫥', cargo: '📦', engine: '⚙️',
}

// ─── Available contract card ──────────────────────────────────────────────────

function AvailableCard({ contract, onOpen, onDecline }: {
  contract: Contract
  onOpen: () => void
  onDecline: () => void
}) {
  const { gameState } = useGameStore()

  const originCity = CITY_MAP.get(contract.origin)
  const destCity   = CITY_MAP.get(contract.destination)
  if (!originCity || !destCity) return null

  // Find feasible vehicle types: route allows them AND they can carry the volume
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
    <div className={`relative rounded-lg border transition-colors ${
      contract.isIllicit
        ? 'border-red-900/60 bg-gray-950 hover:bg-gray-900 hover:border-red-800/60'
        : 'border-gray-700/60 bg-gray-900 hover:bg-gray-800 hover:border-gray-600'
    }`}>
      {/* Card body — click to open modal */}
      <button onClick={onOpen} className="w-full text-left px-2.5 pt-2.5 pb-2 pr-8 space-y-1.5">

        {/* Row 1: route + type badge + payout */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold text-white truncate">
            {originCity.name} → {destCity.name}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {isMultiLeg && (
              <span className="text-xs font-mono px-1 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-900">{contract.legs.length}-LEG</span>
            )}
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
              contract.isIllicit ? 'bg-red-900/80 text-red-300' : 'bg-gray-800 text-gray-400'
            }`}>
              {contract.isIllicit ? 'ILLICIT' : 'LEGIT'}
            </span>
            <span className="text-sm font-mono font-bold text-emerald-400">
              ${contract.payout.toLocaleString()}{contract.isRecurring ? '/run' : ''}
            </span>
          </div>
        </div>

        {/* Row 2: vehicle icons · deadline · recurring */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-gray-400">
            {feasibleVehicles.map(v => VEHICLE_ICON[v]).join(' ') || '—'}
          </span>
          <span className="text-gray-700">·</span>
          <span className={deadlineUrgent ? 'text-red-400' : deadlineWarn ? 'text-yellow-500' : 'text-gray-500'}>
            {isIndefinite ? '∞' : `${contract.deadline}w`}
          </span>
          {isMultiLeg && (
            <>
              <span className="text-gray-700">·</span>
              <span className="text-gray-500">{contract.legs.length} legs</span>
            </>
          )}
          {contract.isRecurring && (
            <>
              <span className="text-gray-700">·</span>
              <span className="text-violet-400">∞ recurring</span>
            </>
          )}
        </div>

        {/* Row 3: upgrade/skill requirements (only when present) */}
        {(hasReqs || skillsLocked) && (
          <div className="text-xs font-mono">
            {skillsLocked
              ? <span className="text-red-500">🔒 Skill required</span>
              : <span className="text-amber-600">
                  {Object.keys(contract.vehicleRequirements).map(k => UPGRADE_ICON[k] ?? '').join(' ')} Upgrade required
                </span>
            }
          </div>
        )}
      </button>

      {/* 1-click dismiss */}
      <button
        onClick={(e) => { e.stopPropagation(); onDecline() }}
        title="Decline"
        className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded text-gray-700 hover:text-gray-300 hover:bg-gray-700 transition-colors text-xs leading-none"
      >
        ✕
      </button>
    </div>
  )
}

// ─── In Transit progress card ─────────────────────────────────────────────────

function InTransitCard({ contract, now, onOpen }: {
  contract: Contract
  now: number
  onOpen: () => void
}) {
  const { gameState } = useGameStore()
  const eu = CONFIG.vehicleUpgrades.effects.engine
  const skillSpeedMult = gameState.unlockedSkills.includes('logistics_2')
    ? CONFIG.skills.effects.logistics_2.transitTimeMultiplier
    : 1.0

  const isMultiLeg   = contract.legs.length > 1
  const isIndefinite = contract.isRecurring && contract.totalRuns >= 999

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
      progress = duration > 0
        ? Math.min(1, Math.max(0, (now - firstShipment.departureTimeMs) / duration))
        : 1
      daysLeft = Math.max(0, Math.ceil((arrivalMs - now) / DAY_MS))
      isFrozen = firstShipment.isFrozen
    }

    return { leg, i, isComplete, firstShipment, primaryVehicle, progress, daysLeft, isFrozen }
  })

  return (
    <button
      onClick={onOpen}
      className={`w-full text-left rounded-lg border px-2.5 py-2.5 space-y-2 transition-colors ${
        contract.isIllicit
          ? 'border-red-900/40 bg-gray-950 hover:bg-gray-900'
          : 'border-gray-700/40 bg-gray-900 hover:bg-gray-800'
      }`}
    >
      {/* Header: route + badges */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-white truncate">
          {isMultiLeg
            ? [
                ...contract.legs.map(l => getCityName(l.origin)),
                getCityName(contract.legs[contract.legs.length - 1]!.destination),
              ].join(' → ')
            : `${CITY_MAP.get(contract.origin)?.name} → ${CITY_MAP.get(contract.destination)?.name}`
          }
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {isMultiLeg && (
            <span className="text-xs font-mono px-1 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-900">{contract.legs.length}-LEG</span>
          )}
          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
            contract.isIllicit ? 'bg-red-900/80 text-red-300' : 'bg-gray-800 text-gray-400'
          }`}>
            {contract.isIllicit ? 'ILLICIT' : 'LEGIT'}
          </span>
        </div>
      </div>

      {/* Per-leg progress rows */}
      {legDisplays.map(({ leg, i, isComplete, firstShipment, primaryVehicle, progress, daysLeft, isFrozen }) => {
        if (isComplete) {
          return (
            <div key={i} className="space-y-1">
              {isMultiLeg && <div className="text-xs font-mono text-gray-600">Leg {i + 1}</div>}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-green-900/30">
                  <div className="h-full w-full rounded-full bg-green-700/70" />
                </div>
                <span className="text-xs font-mono text-green-500 shrink-0">DONE ✓</span>
              </div>
            </div>
          )
        }

        if (firstShipment) {
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-1.5 text-gray-400 min-w-0">
                  {isMultiLeg && <span className="text-gray-600 shrink-0">Leg {i + 1}</span>}
                  {primaryVehicle && (
                    <span className="truncate">
                      {VEHICLE_ICON[primaryVehicle.type]} {primaryVehicle.name}
                    </span>
                  )}
                </span>
                {isFrozen
                  ? <span className="text-amber-500 shrink-0">DELAYED</span>
                  : <span className="text-gray-500 shrink-0">ETA {daysLeft}d</span>
                }
              </div>
              <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    isFrozen ? 'bg-amber-600' : contract.isIllicit ? 'bg-red-600' : 'bg-blue-600'
                  }`}
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )
        }

        // Assigned but waiting (multi-leg: prior leg incomplete; single-leg: orphaned state)
        if (leg.assignedVehicleIds.length > 0) {
          return (
            <div key={i} className="text-xs font-mono text-gray-700">
              {isMultiLeg && `Leg ${i + 1}: `}
              {primaryVehicle && `${VEHICLE_ICON[primaryVehicle.type]} ${primaryVehicle.name}`}
              {isMultiLeg ? ` — awaiting leg ${i}` : ' — dispatching...'}
            </div>
          )
        }

        return null
      })}

      {/* Payout footer */}
      <div className="text-xs font-mono text-gray-600 pt-0.5">
        ${contract.payout.toLocaleString()} on delivery
        {contract.isRecurring && (
          <span> · {contract.runsCompleted}/{isIndefinite ? '∞' : contract.totalRuns} runs</span>
        )}
      </div>
    </button>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ContractBoard() {
  const { gameState, declineContract } = useGameStore()
  const [subNav, setSubNav]   = useState<SubNav>('available')
  const [filter, setFilter]   = useState<Filter>('all')
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [now, setNow]         = useState(currentGameTimeMs)

  // Tick every 500ms so progress bars animate
  useEffect(() => {
    const id = setInterval(() => setNow(currentGameTimeMs), 500)
    return () => clearInterval(id)
  }, [])

  const allContracts = gameState.contracts
  const inTransit    = allContracts.filter(c => c.isAssigned)
  const allAvailable = allContracts.filter(c => !c.isAssigned)
  const available    = allAvailable.filter(c =>
    filter === 'all' ||
    (filter === 'legit' && !c.isIllicit) ||
    (filter === 'illicit' && c.isIllicit),
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Sub-nav ──────────────────────────────────────────────────── */}
      <div className="flex shrink-0 border-b border-gray-700">
        {(['available', 'in-transit'] as SubNav[]).map(nav => {
          const count = nav === 'available' ? allAvailable.length : inTransit.length
          return (
            <button
              key={nav}
              onClick={() => setSubNav(nav)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono tracking-wide transition-colors ${
                subNav === nav
                  ? 'text-white border-b-2 border-amber-500'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {nav === 'available' ? 'Available' : 'In Transit'}
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded-full ${
                subNav === nav ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-600'
              }`}>
                {count}
              </span>
              {/* Dot indicator on In Transit when there are active shipments */}
              {nav === 'in-transit' && inTransit.length > 0 && subNav !== 'in-transit' && (
                <span className="absolute top-2 right-3 w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Available ────────────────────────────────────────────────── */}
      {subNav === 'available' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="shrink-0 px-3 pt-2 pb-1">
            <div className="flex gap-1">
              {(['all', 'legit', 'illicit'] as Filter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 text-xs font-mono py-1 rounded capitalize transition-colors ${
                    filter === f ? 'bg-gray-700 text-white' : 'text-gray-600 hover:text-gray-400'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
            {available.length === 0 ? (
              <p className="text-xs font-mono text-gray-700 text-center py-6">
                {allAvailable.length === 0
                  ? 'No contracts available. Check back after the weekly refresh.'
                  : 'No contracts match this filter.'}
              </p>
            ) : (
              available.map(c => (
                <AvailableCard
                  key={c.id}
                  contract={c}
                  onOpen={() => setSelectedContract(c)}
                  onDecline={() => declineContract(c.id)}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── In Transit ───────────────────────────────────────────────── */}
      {subNav === 'in-transit' && (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {inTransit.length === 0 ? (
            <p className="text-xs font-mono text-gray-700 text-center py-6">
              No active shipments.
            </p>
          ) : (
            inTransit.map(c => (
              <InTransitCard
                key={c.id}
                contract={c}
                now={now}
                onOpen={() => setSelectedContract(c)}
              />
            ))
          )}
        </div>
      )}

      {/* Contract detail modal */}
      {selectedContract && (
        <ContractModal
          contract={selectedContract}
          onClose={() => setSelectedContract(null)}
        />
      )}
    </div>
  )
}
