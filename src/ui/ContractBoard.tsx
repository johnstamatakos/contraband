import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { Contract } from '../engine/gameState'
import { CITY_MAP } from '../data/cities'
import { VEHICLE_ICON } from './vehicleConstants'
const RISK_CLS: Record<'LOW' | 'MED' | 'HIGH', string> = {
  LOW: 'text-green-400 bg-green-900',
  MED: 'text-yellow-400 bg-yellow-900',
  HIGH: 'text-red-400 bg-red-900',
}

type Filter = 'all' | 'legit' | 'illicit'

// ─── Per-contract card ────────────────────────────────────────────────────────

function ContractCard({ contract }: { contract: Contract }) {
  const { gameState, assignVehicle } = useGameStore()
  const [picking, setPicking] = useState(false)

  const originCity = CITY_MAP.get(contract.origin)
  const destCity = CITY_MAP.get(contract.destination)
  if (!originCity || !destCity) return null

  // In-transit info
  const shipment = gameState.shipmentsInTransit.find(s => s.contractId === contract.id)
  const assignedVehicle = shipment ? gameState.fleet.find(v => v.id === shipment.vehicleId) : null

  // Find the open route for this contract
  const route = gameState.routes.find(r =>
    r.status === 'open' &&
    r.origin === contract.origin &&
    r.destination === contract.destination,
  )

  // Eligible vehicles: idle, allowed on route, enough capacity
  const eligibleVehicles = route
    ? gameState.fleet.filter(v =>
        !v.isAssigned &&
        route.allowedVehicles.includes(v.type) &&
        v.capacity >= contract.volume &&
        (!contract.isIllicit || route.illicitLayerActive),
      )
    : []

  const canAssign = !contract.isAssigned && eligibleVehicles.length > 0

  // Reason why assignment is blocked
  let blockedReason: string | null = null
  if (!contract.isAssigned) {
    if (!route) {
      blockedReason = 'Route not established'
    } else if (contract.isIllicit && route.flaggedTurnsRemaining > 0) {
      blockedReason = `Route under investigation (${route.flaggedTurnsRemaining} week${route.flaggedTurnsRemaining !== 1 ? 's' : ''} remaining)`
    } else if (contract.isIllicit && !route.illicitLayerActive) {
      blockedReason = 'Activate illicit layer first'
    } else if (eligibleVehicles.length === 0) {
      const anyIdle = gameState.fleet.filter(v =>
        !v.isAssigned && route.allowedVehicles.includes(v.type),
      )
      blockedReason = anyIdle.length === 0
        ? 'No idle vehicles for this route'
        : 'All idle vehicles are too small'
    }
  }

  const handleAssign = (vehicleId: string) => {
    assignVehicle(contract.id, vehicleId)
    setPicking(false)
  }

  return (
    <div
      className={`border rounded p-3 space-y-2 ${
        contract.isIllicit
          ? 'border-red-900 bg-gray-950'
          : 'border-gray-800 bg-gray-950'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-xs text-white truncate">
          {originCity.name} → {destCity.name}
        </div>
        <div className="flex gap-1 shrink-0">
          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${RISK_CLS[contract.riskLevel]}`}>
            {contract.riskLevel}
          </span>
          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
            contract.isIllicit ? 'bg-red-900 text-red-300' : 'bg-gray-800 text-gray-400'
          }`}>
            {contract.isIllicit ? 'ILLICIT' : 'LEGIT'}
          </span>
        </div>
      </div>

      {/* Cargo info */}
      <div className="flex justify-between text-xs font-mono text-gray-400">
        <span>{contract.cargoType}</span>
        <span className="text-gray-500">{contract.volume} units</span>
      </div>

      {/* Payout + deadline */}
      <div className="flex justify-between text-xs font-mono">
        <span className="text-emerald-400">+${contract.payout.toLocaleString()}</span>
        {contract.repReward && (
          <span className="text-blue-400">+{contract.repReward} rep</span>
        )}
        <span className={contract.deadline <= 1 ? 'text-red-400' : 'text-gray-500'}>
          {contract.deadline} week{contract.deadline !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Status / Actions */}
      {contract.isAssigned && assignedVehicle && shipment ? (
        <div className="flex items-center gap-2 text-xs font-mono text-yellow-400">
          <span>{VEHICLE_ICON[assignedVehicle.type]}</span>
          <span>{assignedVehicle.name}</span>
          <span className="text-gray-600 ml-auto">
            in transit
          </span>
        </div>
      ) : picking ? (
        <div className="space-y-1">
          <div className="text-xs font-mono text-gray-500 mb-1">Pick a vehicle:</div>
          {eligibleVehicles.map(v => {
            const travelDays = route?.travelDays[v.type]
            return (
              <button
                key={v.id}
                onClick={() => handleAssign(v.id)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs font-mono text-white transition-colors"
              >
                <span>{VEHICLE_ICON[v.type]} {v.name} ({v.capacity} cap)</span>
                {travelDays && (
                  <span className="text-gray-400">{travelDays} day{travelDays > 1 ? 's' : ''}</span>
                )}
              </button>
            )
          })}
          <button
            onClick={() => setPicking(false)}
            className="w-full py-1 text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : blockedReason ? (
        <div className="text-xs font-mono text-gray-600 py-0.5">{blockedReason}</div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          disabled={!canAssign}
          className="w-full text-xs font-mono py-1.5 rounded transition-colors bg-gray-800 hover:bg-gray-700 text-gray-300 cursor-pointer"
        >
          Assign Vehicle
        </button>
      )}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ContractBoard() {
  const { gameState } = useGameStore()
  const [filter, setFilter] = useState<Filter>('all')

  const allContracts = gameState.contracts

  const inTransit = allContracts.filter(c => c.isAssigned)
  const available = allContracts.filter(c => !c.isAssigned && (
    filter === 'all' ||
    (filter === 'legit' && !c.isIllicit) ||
    (filter === 'illicit' && c.isIllicit)
  ))

  return (
    <div className="flex flex-col h-full">
      {/* Panel header + filter tabs */}
      <div className="px-3 py-2 border-b border-gray-700">
        <div className="flex gap-1">
          {(['all', 'legit', 'illicit'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 text-xs font-mono py-1 rounded transition-colors capitalize ${
                filter === f
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* In Transit */}
        {inTransit.length > 0 && (
          <div>
            <div className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-2">
              In Transit ({inTransit.length})
            </div>
            <div className="space-y-2">
              {inTransit.map(c => <ContractCard key={c.id} contract={c} />)}
            </div>
          </div>
        )}

        {/* Available */}
        <div>
          <div className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-2">
            Available ({available.length})
          </div>
          {available.length === 0 ? (
            <p className="text-xs font-mono text-gray-700 text-center py-4">
              {allContracts.filter(c => !c.isAssigned).length === 0
                ? 'No contracts. Wait for the next weekly refresh.'
                : 'No contracts match filter.'}
            </p>
          ) : (
            <div className="space-y-2">
              {available.map(c => <ContractCard key={c.id} contract={c} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
