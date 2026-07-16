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

import type { UpgradeType } from '../engine/gameState'

const UPGRADE_BADGE: Record<UpgradeType, { label: string; color: string }> = {
  cargo:       { label: 'HOLD',  color: 'bg-blue-950 text-blue-400 border-blue-800' },
  engine:      { label: 'ENG',   color: 'bg-amber-950 text-amber-400 border-amber-800' },
  concealment: { label: 'HIDE',  color: 'bg-emerald-950 text-emerald-400 border-emerald-800' },
  range:       { label: 'RANGE', color: 'bg-orange-950 text-orange-400 border-orange-800' },
}

const UPGRADE_TYPES: UpgradeType[] = ['cargo', 'engine', 'concealment', 'range']

const VEHICLE_TYPE_ORDER: VehicleType[] = ['truck', 'plane', 'ship']

const SECTION_LABEL: Record<VehicleType, string> = {
  truck: 'Trucks',
  plane: 'Planes',
  ship:  'Ships',
}

export function FleetPanel() {
  const { gameState, buyVehicle, payImpoundFine, sellVehicle } = useGameStore()
  const { fleet, cash, shipmentsInTransit, contracts } = gameState
  const [upgradingVehicleId, setUpgradingVehicleId] = useState<string | null>(null)
  const [confirmSellId, setConfirmSellId]           = useState<string | null>(null)
  const [buyMenuOpen, setBuyMenuOpen]               = useState(false)

  const availableCount = fleet.filter(v => !v.isImpounded).length

  const upgradingVehicle = upgradingVehicleId
    ? fleet.find(v => v.id === upgradingVehicleId) ?? null
    : null

  const groupedFleet = VEHICLE_TYPE_ORDER.map(type => ({
    type,
    vehicles: fleet.filter(v => v.type === type),
  })).filter(g => g.vehicles.length > 0)

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── FLEET SECTIONS ─────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 px-3 py-3 space-y-4">
          {groupedFleet.length === 0 && (
            <div className="text-center text-gray-600 font-mono text-xs pt-8">
              No vehicles. Buy one below.
            </div>
          )}

          {groupedFleet.map(({ type, vehicles }) => (
            <div key={type}>
              {/* Section header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base leading-none">{VEHICLE_ICON[type]}</span>
                <span className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider">
                  {SECTION_LABEL[type]}
                </span>
                <span className="text-xs font-mono text-gray-600">({vehicles.length})</span>
              </div>

              <div className="space-y-2">
                {vehicles.map(vehicle => {
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
                      {/* Top row: name + status */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-sm font-mono font-semibold truncate ${isImpounded ? 'text-red-300' : 'text-white'}`}>
                          {vehicle.name}
                        </span>
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

                          {/* Bottom row: upgrade badges + action buttons */}
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
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Sell button — only for idle vehicles when 2+ are available */}
                              {!vehicle.isAssigned && availableCount > 1 && (
                                confirmSellId === vehicle.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => { sellVehicle(vehicle.id); setConfirmSellId(null) }}
                                      className="text-xs font-mono px-2 py-0.5 rounded bg-red-900 hover:bg-red-800 text-red-300 border border-red-700 transition-colors"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => setConfirmSellId(null)}
                                      className="text-xs font-mono px-1.5 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmSellId(vehicle.id)}
                                    title={`Sell for $${vehicle.resaleValue.toLocaleString()}`}
                                    className="text-xs font-mono text-gray-600 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-gray-700 transition-colors"
                                  >
                                    Sell ${vehicle.resaleValue.toLocaleString()}
                                  </button>
                                )
                              )}
                              <button
                                onClick={() => setUpgradingVehicleId(vehicle.id)}
                                title="Upgrade vehicle"
                                className="text-gray-600 hover:text-gray-300 text-sm px-1 py-0.5 rounded hover:bg-gray-700 transition-colors"
                              >
                                🔧
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ── ADD VEHICLE CTA ─────────────────────────────────────── */}
        <div className="shrink-0 border-t border-gray-700 px-3 py-3">
          <button
            onClick={() => setBuyMenuOpen(true)}
            className="w-full py-2.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 border border-emerald-700 text-emerald-300 text-sm font-mono font-semibold tracking-wide transition-colors"
          >
            + Add Vehicle
          </button>
        </div>
      </div>

      {/* ── BUY VEHICLE MODAL ──────────────────────────────────────── */}
      {buyMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ pointerEvents: 'auto' }}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setBuyMenuOpen(false)}
          />

          {/* Sheet */}
          <div className="relative z-10 w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl px-4 pt-4 pb-6 shadow-2xl mx-4">
            {/* Handle + header */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-mono font-semibold text-gray-200 uppercase tracking-wider">
                Add Vehicle
              </span>
              <button
                onClick={() => setBuyMenuOpen(false)}
                className="text-gray-500 hover:text-gray-300 text-lg leading-none transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              {(['truck', 'plane', 'ship'] as VehicleType[]).map(type => {
                const spec = VEHICLE_SPECS[type]
                const canAfford = cash >= spec.purchasePrice
                const vu = CONFIG.vehicleUpgrades
                const t1Cost = Math.round(spec.purchasePrice * vu.tier1CostFraction)

                return (
                  <button
                    key={type}
                    onClick={() => { buyVehicle(type); setBuyMenuOpen(false) }}
                    disabled={!canAfford}
                    className={`w-full rounded-lg px-3 py-3 text-left transition-colors ${
                      canAfford
                        ? 'bg-gray-800 hover:bg-gray-700 cursor-pointer'
                        : 'bg-gray-900 border border-gray-800 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-mono font-semibold ${canAfford ? 'text-white' : 'text-gray-600'}`}>
                        {VEHICLE_ICON[type]} {VEHICLE_LABEL[type]}
                      </span>
                      <span className={`text-sm font-mono font-bold ${canAfford ? 'text-emerald-400' : 'text-red-700'}`}>
                        ${spec.purchasePrice.toLocaleString()}
                      </span>
                    </div>
                    <div className={`text-xs font-mono ${canAfford ? 'text-gray-500' : 'text-gray-700'}`}>
                      {spec.capacity} cap · ${spec.maintenancePerTurn}/wk · upgrades from ${t1Cost.toLocaleString()}
                    </div>
                    {!canAfford && (
                      <div className="text-xs font-mono text-red-800 mt-0.5">
                        Need ${(spec.purchasePrice - cash).toLocaleString()} more
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 text-center text-xs font-mono text-gray-600">
              Balance: <span className="text-gray-400">${cash.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

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
