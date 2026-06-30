import { useGameStore } from '../store/gameStore'
import type { VehicleType } from '../engine/gameState'
import { VEHICLE_SPECS } from '../engine/gameState'
import { getCityName } from '../data/cities'
import { VEHICLE_ICON, VEHICLE_LABEL } from './vehicleConstants'

export function FleetPanel() {
  const { gameState, buyVehicle } = useGameStore()
  const { fleet, cash, shipmentsInTransit, contracts } = gameState

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-gray-700">
        <h2 className="text-xs font-mono uppercase tracking-widest text-gray-500">Fleet</h2>
      </div>

      {/* Current fleet */}
      <div className="px-4 py-3 space-y-2">
        {fleet.map(vehicle => (
          <div
            key={vehicle.id}
            className="flex items-start justify-between bg-gray-800 rounded px-3 py-2"
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5">{VEHICLE_ICON[vehicle.type]}</span>
              <div>
                <div className="text-xs font-mono text-white">{vehicle.name}</div>
                <div className="text-xs font-mono text-gray-500">
                  {vehicle.capacity} cap · ${vehicle.maintenancePerTurn}/turn
                </div>
                {vehicle.isAssigned && (() => {
                  const shipment = shipmentsInTransit.find(s => s.vehicleId === vehicle.id)
                  const contract = shipment ? contracts.find(c => c.id === shipment.contractId) : null
                  if (!shipment || !contract) return null
                  return (
                    <div className="text-xs font-mono text-yellow-500 mt-0.5">
                      {getCityName(contract.origin)} → {getCityName(contract.destination)}
                    </div>
                  )
                })()}
              </div>
            </div>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                vehicle.isAssigned
                  ? 'bg-yellow-900 text-yellow-400'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              {vehicle.isAssigned ? 'TRANSIT' : 'IDLE'}
            </span>
          </div>
        ))}
      </div>

      {/* Purchase section */}
      <div className="px-4 pb-4 border-t border-gray-800 pt-3">
        <div className="text-xs font-mono text-gray-600 mb-2 uppercase tracking-widest">Purchase</div>
        <div className="space-y-2">
          {(['truck', 'plane', 'ship'] as VehicleType[]).map(type => {
            const spec = VEHICLE_SPECS[type]
            const canAfford = cash >= spec.purchasePrice
            return (
              <button
                key={type}
                onClick={() => buyVehicle(type)}
                disabled={!canAfford}
                className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-mono transition-colors ${
                  canAfford
                    ? 'bg-gray-700 hover:bg-gray-600 text-white cursor-pointer'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                }`}
              >
                <span>
                  {VEHICLE_ICON[type]} {VEHICLE_LABEL[type]}
                </span>
                <span className={canAfford ? 'text-emerald-400' : 'text-gray-600'}>
                  ${spec.purchasePrice.toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
