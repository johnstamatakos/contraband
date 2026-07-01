import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { VehicleType } from '../engine/gameState'
import { VEHICLE_SPECS } from '../engine/gameState'
import { CONFIG } from '../engine/config'
import { getCityName } from '../data/cities'
import { VEHICLE_ICON, VEHICLE_LABEL } from './vehicleConstants'
import { VehicleUpgradeModal } from './VehicleUpgradeModal'

// Weeks remaining until a vehicle is permanently seized
function weeksUntilSeized(expiresOnTurn: number, currentTurn: number): number {
  return Math.max(0, expiresOnTurn - currentTurn)
}

type UpgradeType = 'cargo' | 'engine' | 'concealment'

const UPGRADE_BADGE: Record<UpgradeType, { label: string; color: string }> = {
  cargo:       { label: 'HOLD', color: 'bg-blue-950 text-blue-400 border-blue-800' },
  engine:      { label: 'ENG',  color: 'bg-amber-950 text-amber-400 border-amber-800' },
  concealment: { label: 'HIDE', color: 'bg-emerald-950 text-emerald-400 border-emerald-800' },
}

const UPGRADE_TYPES: UpgradeType[] = ['cargo', 'engine', 'concealment']

export function FleetPanel() {
  const { gameState, buyVehicle, payImpoundFine } = useGameStore()
  const { fleet, cash, shipmentsInTransit, contracts } = gameState
  const [upgradingVehicleId, setUpgradingVehicleId] = useState<string | null>(null)
  const [fleetOpen, setFleetOpen] = useState(true)

  const upgradingVehicle = upgradingVehicleId
    ? fleet.find(v => v.id === upgradingVehicleId) ?? null
    : null

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── YOUR FLEET ─────────────────────────────────────────── */}
        <div className="shrink-0 px-3 pt-3 pb-1">
          <button
            onClick={() => setFleetOpen(o => !o)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            <span className="text-xs font-mono font-semibold text-gray-300 uppercase tracking-wider">Your Fleet</span>
            <span className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-500">{fleet.length}</span>
              <span className="text-gray-500 text-xs">{fleetOpen ? '▴' : '▾'}</span>
            </span>
          </button>
        </div>

        {fleetOpen && <div className="overflow-y-auto flex-1 px-3 pb-3 space-y-2">
          {fleet.map(vehicle => {
            const shipment = shipmentsInTransit.find(s => s.vehicleId === vehicle.id)
            const contract = shipment ? contracts.find(c => c.id === shipment.contractId) : null
            const activeUpgrades = UPGRADE_TYPES.filter(u => vehicle.upgrades[u] > 0)

            const isImpounded = vehicle.isImpounded
            const weeksLeft = isImpounded && vehicle.impoundExpiresOnTurn !== null
              ? weeksUntilSeized(vehicle.impoundExpiresOnTurn, gameState.turn)
              : null
            const canPayFine = isImpounded && vehicle.impoundFine !== null && cash >= vehicle.impoundFine

            return (
              <div
                key={vehicle.id}
                className={`rounded-lg px-3 py-2.5 ${isImpounded ? 'bg-red-950/40 border border-red-900/50' : 'bg-gray-800'}`}
              >
                {/* Top row: icon + name + status */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0">{VEHICLE_ICON[vehicle.type]}</span>
                    <span className={`text-sm font-mono font-semibold truncate ${isImpounded ? 'text-red-300' : 'text-white'}`}>
                      {vehicle.name}
                    </span>
                  </div>
                  <span className={`shrink-0 text-xs font-mono px-2 py-0.5 rounded ml-2 ${
                    isImpounded
                      ? 'bg-red-900/60 text-red-400 border border-red-800'
                      : vehicle.isAssigned
                        ? 'bg-yellow-900/60 text-yellow-400 border border-yellow-800'
                        : 'bg-gray-700 text-gray-400 border border-gray-600'
                  }`}>
                    {isImpounded ? 'IMPOUNDED' : vehicle.isAssigned ? 'TRANSIT' : 'IDLE'}
                  </span>
                </div>

                {/* Stats row */}
                <div className="text-xs font-mono text-gray-500 mb-1.5">
                  {vehicle.capacity} cap · ${vehicle.maintenancePerTurn}/wk
                </div>

                {/* Impound info + pay button */}
                {isImpounded && vehicle.impoundFine !== null ? (
                  <div className="space-y-1.5">
                    <div className="text-xs font-mono text-red-400">
                      Fine: ${vehicle.impoundFine.toLocaleString()}
                      {weeksLeft !== null && (
                        <span className="text-red-600 ml-2">· {weeksLeft} week{weeksLeft !== 1 ? 's' : ''} left</span>
                      )}
                    </div>
                    <button
                      onClick={() => payImpoundFine(vehicle.id)}
                      disabled={!canPayFine}
                      className={`w-full py-1.5 text-xs font-mono rounded border transition-colors ${
                        canPayFine
                          ? 'bg-red-950 border-red-700 text-red-300 hover:bg-red-900'
                          : 'bg-gray-900 border-gray-700 text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      Pay Fine — <span className={canPayFine ? 'text-emerald-400' : 'text-gray-600'}>
                        ${vehicle.impoundFine.toLocaleString()}
                      </span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Route if in transit */}
                    {contract && (
                      <div className="text-xs font-mono text-yellow-500 mb-1.5">
                        {getCityName(contract.origin)} → {getCityName(contract.destination)}
                      </div>
                    )}

                    {/* Bottom row: upgrade badges + upgrade button */}
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <div className="flex flex-wrap gap-1">
                        {activeUpgrades.length > 0 ? (
                          activeUpgrades.map(u => (
                            <span
                              key={u}
                              className={`text-xs font-mono px-1.5 py-0.5 rounded border ${UPGRADE_BADGE[u].color}`}
                            >
                              {UPGRADE_BADGE[u].label} T{vehicle.upgrades[u]}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs font-mono text-gray-700 italic">No upgrades</span>
                        )}
                      </div>
                      <button
                        onClick={() => setUpgradingVehicleId(vehicle.id)}
                        title="Upgrade vehicle"
                        className="shrink-0 text-gray-600 hover:text-gray-300 text-sm px-1 py-0.5 rounded hover:bg-gray-700 transition-colors"
                      >
                        🔧
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>}

        {/* ── BUY VEHICLE ────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-gray-700 bg-gray-950">
          <div className="px-3 pt-3 pb-1">
            <div className="flex items-center justify-between px-2 py-1.5 rounded bg-gray-800">
              <span className="text-xs font-mono font-semibold text-gray-300 uppercase tracking-wider">Buy Vehicle</span>
            </div>
          </div>
          <div className="px-3 pb-3 space-y-1.5">
            {(['truck', 'plane', 'ship'] as VehicleType[]).map(type => {
              const spec = VEHICLE_SPECS[type]
              const canAfford = cash >= spec.purchasePrice
              const vu = CONFIG.vehicleUpgrades
              const t1Cost = Math.round(spec.purchasePrice * vu.tier1CostFraction)

              return (
                <button
                  key={type}
                  onClick={() => buyVehicle(type)}
                  disabled={!canAfford}
                  className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                    canAfford
                      ? 'bg-gray-800 hover:bg-gray-700 cursor-pointer'
                      : 'bg-gray-900 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-mono font-semibold ${canAfford ? 'text-white' : 'text-gray-600'}`}>
                      {VEHICLE_ICON[type]} {VEHICLE_LABEL[type]}
                    </span>
                    <span className={`text-sm font-mono font-bold ${canAfford ? 'text-emerald-400' : 'text-gray-600'}`}>
                      ${spec.purchasePrice.toLocaleString()}
                    </span>
                  </div>
                  <div className={`text-xs font-mono ${canAfford ? 'text-gray-500' : 'text-gray-700'}`}>
                    {spec.capacity} cap · ${spec.maintenancePerTurn}/wk · upgrades from ${t1Cost.toLocaleString()}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Upgrade modal */}
      {upgradingVehicle && (
        <VehicleUpgradeModal
          vehicle={upgradingVehicle}
          cash={cash}
          onClose={() => setUpgradingVehicleId(null)}
        />
      )}
    </>
  )
}
