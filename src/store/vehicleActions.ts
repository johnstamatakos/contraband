import type { GameState, Vehicle, VehicleType, UpgradeType } from '../engine/gameState'
import { VEHICLE_SPECS, DEFAULT_UPGRADES } from '../engine/gameState'
import { CONFIG } from '../engine/config'
import { currentGameTimeMs } from './gameStore'
import { bumpStats } from './statsHelpers'

let vehicleCounter = 3

export function resetVehicleCounter(): void {
  vehicleCounter = 3
}

/** Call after rehydrating persisted state so new IDs never collide with saved ones. */
export function syncVehicleCounter(fleet: Vehicle[]): void {
  for (const v of fleet) {
    const match = v.id.match(/_(\d+)$/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num >= vehicleCounter) vehicleCounter = num + 1
    }
  }
}

export function createVehicleActions(
  get: () => { gameState: GameState },
  set: (updater: { gameState: GameState }) => void,
) {
  return {
    buyVehicle: (type: VehicleType) => {
      const { gameState } = get()
      const spec = VEHICLE_SPECS[type]
      if (gameState.cash < spec.purchasePrice) return

      const id = `${type}_${String(vehicleCounter).padStart(2, '0')}`
      vehicleCounter++
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1)

      const vehicle: Vehicle = {
        id, type, name: `${typeLabel} #${vehicleCounter - 1}`,
        ...spec, isAssigned: false, currentShipmentId: null,
        upgrades: { ...DEFAULT_UPGRADES },
        isImpounded: false, impoundFine: null, impoundExpiresOnTurn: null, impoundReason: null,
      }

      const newEvent = {
        id: `e_buy_${id}`, gameTimeMs: currentGameTimeMs,
        message: `Purchased ${vehicle.name} for $${spec.purchasePrice.toLocaleString()}.`,
        type: 'success' as const,
      }

      const newFleet = [...gameState.fleet, vehicle]
      set({
        gameState: {
          ...gameState,
          cash: gameState.cash - spec.purchasePrice,
          fleet: newFleet,
          events: [...gameState.events, newEvent].slice(-50),
          weeklyStats: {
            ...gameState.weeklyStats,
            expenseBreakdown: {
              ...gameState.weeklyStats.expenseBreakdown,
              'Vehicles': (gameState.weeklyStats.expenseBreakdown['Vehicles'] ?? 0) + spec.purchasePrice,
            },
          },
          lifetimeStats: {
            ...bumpStats(gameState.lifetimeStats, { totalMoneySpent: spec.purchasePrice, vehiclesPurchased: 1 }),
            largestFleetSize: Math.max(gameState.lifetimeStats.largestFleetSize, newFleet.length),
          },
        },
      })
    },

    sellVehicle: (vehicleId: string) => {
      const { gameState } = get()
      const vehicle = gameState.fleet.find(v => v.id === vehicleId)
      if (!vehicle || vehicle.isAssigned || vehicle.isImpounded) return
      if (gameState.fleet.filter(v => !v.isImpounded).length <= 1) return

      const newEvent = {
        id: `e_sell_${vehicleId}_${currentGameTimeMs}`, gameTimeMs: currentGameTimeMs,
        message: `Sold ${vehicle.name} for $${vehicle.resaleValue.toLocaleString()}.`,
        type: 'info' as const,
      }

      set({
        gameState: {
          ...gameState,
          cash: gameState.cash + vehicle.resaleValue,
          fleet: gameState.fleet.filter(v => v.id !== vehicleId),
          events: [...gameState.events, newEvent].slice(-50),
          lifetimeStats: bumpStats(gameState.lifetimeStats, { totalMoneyEarned: vehicle.resaleValue }),
        },
      })
    },

    upgradeVehicle: (vehicleId: string, upgradeType: UpgradeType) => {
      const { gameState } = get()
      const vehicle = gameState.fleet.find(v => v.id === vehicleId)
      if (!vehicle) return

      const currentTier = vehicle.upgrades[upgradeType]
      if (currentTier >= 2) return

      const nextTier = (currentTier + 1) as 1 | 2
      const fraction = nextTier === 1
        ? CONFIG.vehicleUpgrades.tier1CostFraction
        : CONFIG.vehicleUpgrades.tier2CostFraction
      const cost = Math.round(vehicle.purchasePrice * fraction)
      if (gameState.cash < cost) return

      const UPGRADE_LABELS: Record<UpgradeType, string> = {
        cargo: 'Cargo Hold', engine: 'Engine', concealment: 'Concealment', range: 'Fuel Tank',
      }
      const newEvent = {
        id: `e_upgrade_${vehicleId}_${upgradeType}_${currentGameTimeMs}`,
        gameTimeMs: currentGameTimeMs,
        message: `${vehicle.name}: ${UPGRADE_LABELS[upgradeType]} upgraded to Tier ${nextTier}. -$${cost.toLocaleString()}`,
        type: 'success' as const,
      }

      set({
        gameState: {
          ...gameState,
          cash: gameState.cash - cost,
          fleet: gameState.fleet.map(v =>
            v.id === vehicleId ? { ...v, upgrades: { ...v.upgrades, [upgradeType]: nextTier } } : v,
          ),
          events: [...gameState.events, newEvent].slice(-50),
          weeklyStats: {
            ...gameState.weeklyStats,
            expenseBreakdown: {
              ...gameState.weeklyStats.expenseBreakdown,
              'Upgrades': (gameState.weeklyStats.expenseBreakdown['Upgrades'] ?? 0) + cost,
            },
          },
          lifetimeStats: bumpStats(gameState.lifetimeStats, { totalMoneySpent: cost }),
        },
      })
    },

    payImpoundFine: (vehicleId: string) => {
      const { gameState } = get()
      const vehicle = gameState.fleet.find(v => v.id === vehicleId)
      if (!vehicle || !vehicle.isImpounded || vehicle.impoundFine === null) return
      if (gameState.cash < vehicle.impoundFine) return

      const newEvent = {
        id: `e_impound_${vehicleId}_${currentGameTimeMs}`, gameTimeMs: currentGameTimeMs,
        message: `${vehicle.name} recovered from impound. -$${vehicle.impoundFine.toLocaleString()}`,
        type: 'success' as const,
      }

      set({
        gameState: {
          ...gameState,
          cash: gameState.cash - vehicle.impoundFine,
          fleet: gameState.fleet.map(v =>
            v.id === vehicleId ? { ...v, isImpounded: false, impoundFine: null, impoundExpiresOnTurn: null } : v,
          ),
          events: [...gameState.events, newEvent].slice(-50),
          weeklyStats: {
            ...gameState.weeklyStats,
            expenseBreakdown: {
              ...gameState.weeklyStats.expenseBreakdown,
              'Impound fines': (gameState.weeklyStats.expenseBreakdown['Impound fines'] ?? 0) + vehicle.impoundFine,
            },
          },
          lifetimeStats: bumpStats(gameState.lifetimeStats, { totalMoneySpent: vehicle.impoundFine }),
        },
      })
    },
  }
}
