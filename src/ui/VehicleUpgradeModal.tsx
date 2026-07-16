import { useGameStore } from '../store/gameStore'
import { CONFIG } from '../engine/config'
import { VEHICLE_ICON } from './vehicleConstants'
import type { Vehicle, UpgradeType } from '../engine/gameState'

interface UpgradeDef {
  type: UpgradeType
  label: string
  tier1Effect: string
  tier2Effect: string
}

const UPGRADES: UpgradeDef[] = [
  {
    type: 'cargo',
    label: 'Cargo Hold',
    tier1Effect: `+${Math.round(CONFIG.vehicleUpgrades.effects.cargo.tier1PayoutBonus * 100)}% payout per delivery`,
    tier2Effect: `+${Math.round(CONFIG.vehicleUpgrades.effects.cargo.tier2PayoutBonus * 100)}% payout per delivery`,
  },
  {
    type: 'engine',
    label: 'Engine',
    tier1Effect: `−${Math.round((1 - CONFIG.vehicleUpgrades.effects.engine.tier1TransitMultiplier) * 100)}% transit time`,
    tier2Effect: `−${Math.round((1 - CONFIG.vehicleUpgrades.effects.engine.tier2TransitMultiplier) * 100)}% transit time`,
  },
  {
    type: 'concealment',
    label: 'Concealment',
    tier1Effect: `−${Math.round(CONFIG.vehicleUpgrades.effects.concealment.tier1DetectionReduction * 100)}% detection chance`,
    tier2Effect: `−${Math.round(CONFIG.vehicleUpgrades.effects.concealment.tier2DetectionReduction * 100)}% detection chance`,
  },
  {
    type: 'range',
    label: 'Fuel Tank',
    tier1Effect: 'Unlocks international contracts',
    tier2Effect: 'Unlocks long-haul contracts',
  },
]

function TierDots({ current, max = 2 }: { current: number; max?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${i < current ? 'bg-amber-400' : 'bg-gray-700'}`}
        />
      ))}
    </div>
  )
}

interface Props {
  vehicle: Vehicle
  cash: number
  onClose: () => void
}

export function VehicleUpgradeModal({ vehicle, cash, onClose }: Props) {
  const { upgradeVehicle } = useGameStore()

  const upgradeCost = (currentTier: number) => {
    const nextTier = currentTier + 1
    const fraction = nextTier === 1
      ? CONFIG.vehicleUpgrades.tier1CostFraction
      : CONFIG.vehicleUpgrades.tier2CostFraction
    return Math.round(vehicle.purchasePrice * fraction)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-80">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <span>{VEHICLE_ICON[vehicle.type]}</span>
              <span className="text-sm font-mono font-semibold text-white">{vehicle.name}</span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-lg leading-none"
            >
              ✕
            </button>
          </div>

          {/* Upgrade rows */}
          <div className="divide-y divide-gray-800">
            {UPGRADES.map(upgrade => {
              const currentTier = vehicle.upgrades[upgrade.type]
              const isMaxed = currentTier >= 2
              const cost = isMaxed ? 0 : upgradeCost(currentTier)
              const canAfford = cash >= cost
              const nextEffect = currentTier === 0 ? upgrade.tier1Effect : upgrade.tier2Effect

              return (
                <div key={upgrade.type} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-semibold text-gray-300 uppercase tracking-widest">
                      {upgrade.label}
                    </span>
                    <TierDots current={currentTier} />
                  </div>

                  {isMaxed ? (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-amber-400">{upgrade.tier2Effect}</span>
                      <span className="text-xs font-mono text-green-600 border border-green-900 px-1.5 py-0.5 rounded">MAX</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        {currentTier > 0 && (
                          <div className="text-xs font-mono text-amber-400 mb-0.5">
                            {currentTier === 1 ? upgrade.tier1Effect : upgrade.tier2Effect}
                          </div>
                        )}
                        <div className="text-xs font-mono text-gray-500">
                          Next: {nextEffect}
                        </div>
                      </div>
                      <button
                        onClick={() => upgradeVehicle(vehicle.id, upgrade.type)}
                        disabled={!canAfford}
                        className={`shrink-0 px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                          canAfford
                            ? 'bg-amber-950 border-amber-700 text-amber-300 hover:bg-amber-900'
                            : 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                        }`}
                      >
                        <span className={canAfford ? 'text-emerald-400' : 'text-gray-600'}>
                          ${cost.toLocaleString()}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
