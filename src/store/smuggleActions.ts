import type { GameState, Vehicle, ShipmentInTransit, SmuggleRun, SmuggleRunHop } from '../engine/gameState'
import { CONFIG } from '../engine/config'
import { getCityName } from '../data/cities'
import { getAvailablePurchases } from '../data/commodities'
import { findRouteBetween } from '../engine/pathfinding'
import { currentGameTimeMs } from './gameStore'
import { bumpStats } from './statsHelpers'

export interface SmuggleRunConfig {
  sourceCity: string
  destinationCity: string
  commodityKey: string
  volume: number
  path: string[]
  vehicleIds: string[]
  sellPricePerUnit: number
  repReward: number
}

export function createSmuggleActions(
  get: () => { gameState: GameState },
  set: (updater: { gameState: GameState }) => void,
) {
  return {
    purchaseCommodity: (cityId: string, commodityKey: string, quantity: number) => {
      if (quantity <= 0) return
      const { gameState } = get()

      const available = getAvailablePurchases(cityId)
      const commodity = available.find(c => c.key === commodityKey)
      if (!commodity) return

      const totalCost = commodity.buyPrice * quantity
      if (gameState.cash < totalCost) return

      const cityInv = { ...gameState.cityInventory }
      const cityStock = { ...(cityInv[cityId] ?? {}) }
      cityStock[commodityKey] = (cityStock[commodityKey] ?? 0) + quantity
      cityInv[cityId] = cityStock

      const newEvent = {
        id: `e_buy_${commodityKey}_${currentGameTimeMs}`,
        gameTimeMs: currentGameTimeMs,
        message: `Purchased ${quantity} ${commodity.displayName} in ${getCityName(cityId)} for $${totalCost.toLocaleString()}`,
        type: 'info' as const,
      }

      set({
        gameState: {
          ...gameState,
          cash: gameState.cash - totalCost,
          cityInventory: cityInv,
          events: [...gameState.events, newEvent].slice(-CONFIG.ui.eventFeedCap),
          lifetimeStats: bumpStats(gameState.lifetimeStats, { totalMoneySpent: totalCost }),
        },
      })
    },

    launchSmuggleRun: (config: SmuggleRunConfig) => {
      const { gameState } = get()
      const { sourceCity, destinationCity, commodityKey, volume, path, vehicleIds, sellPricePerUnit, repReward } = config

      const cityInv = gameState.cityInventory[sourceCity]
      if (!cityInv || (cityInv[commodityKey] ?? 0) < volume) return
      if (path.length < 2 || path[0] !== sourceCity || path[path.length - 1] !== destinationCity) return

      const vehicles = vehicleIds.map(id => gameState.fleet.find(v => v.id === id)).filter(Boolean) as Vehicle[]
      if (vehicles.length !== vehicleIds.length) return
      if (vehicles.some(v => v.isAssigned || v.isImpounded)) return

      const hops: SmuggleRunHop[] = []
      for (let i = 0; i < path.length - 1; i++) {
        const route = findRouteBetween(path[i]!, path[i + 1]!, gameState.routes)
        if (!route) return
        for (const v of vehicles) {
          if (!route.allowedVehicles.includes(v.type)) return
        }
        hops.push({
          origin: path[i]!, destination: path[i + 1]!,
          routeId: route.id, routeTier: route.tier,
          status: i === 0 ? 'in_transit' : 'pending',
          shipmentIds: [], departureTimeMs: i === 0 ? currentGameTimeMs : null,
        })
      }

      const commodityDef = CONFIG.smuggling.commodities[commodityKey as keyof typeof CONFIG.smuggling.commodities]
      if (!commodityDef) return

      const smuggleRunId = `smg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

      const newShipments: ShipmentInTransit[] = []
      const firstRoute = findRouteBetween(path[0]!, path[1]!, gameState.routes)!
      for (const v of vehicles) {
        const travelDays = firstRoute.travelDays[v.type]
        if (!travelDays) return
        const shipId = `ship_smg_${Date.now()}_${v.id}`
        newShipments.push({
          id: shipId, contractId: '', vehicleId: v.id,
          routeId: firstRoute.id, legIndex: 0,
          turnsRemaining: travelDays, totalTurns: travelDays,
          isIllicit: true, isFrozen: false,
          departureTimeMs: currentGameTimeMs, frozenDurationMs: 0,
          smuggleRunId, reversed: firstRoute.origin !== path[0]!,
        })
        hops[0]!.shipmentIds.push(shipId)
      }

      const smuggleRun: SmuggleRun = {
        id: smuggleRunId, commodityKey, volume,
        buyPricePerUnit: commodityDef.buyPrice, sellPricePerUnit,
        expectedPayout: volume * sellPricePerUnit,
        sourceCity, destinationCity, hops, currentHopIndex: 0,
        vehicleIds, repReward, status: 'in_transit',
        createdAtTurn: gameState.turn, completedAtTurn: null,
      }

      const updatedCityInv = { ...gameState.cityInventory }
      const updatedCityStock = { ...(updatedCityInv[sourceCity] ?? {}) }
      updatedCityStock[commodityKey] = (updatedCityStock[commodityKey] ?? 0) - volume
      if (updatedCityStock[commodityKey]! <= 0) delete updatedCityStock[commodityKey]
      updatedCityInv[sourceCity] = updatedCityStock

      const updatedFleet = gameState.fleet.map(v =>
        vehicleIds.includes(v.id)
          ? { ...v, isAssigned: true, currentShipmentId: newShipments.find(s => s.vehicleId === v.id)?.id ?? null }
          : v,
      )

      const event = {
        id: `e_smg_launch_${smuggleRunId}`, gameTimeMs: currentGameTimeMs,
        message: `Smuggling ${volume} ${commodityDef.displayName}: ${getCityName(sourceCity)} → ${getCityName(destinationCity)} (${hops.length} hops, ${vehicles.length} vehicle${vehicles.length > 1 ? 's' : ''})`,
        type: 'warning' as const,
      }

      set({
        gameState: {
          ...gameState,
          cityInventory: updatedCityInv,
          smuggleRuns: [...gameState.smuggleRuns, smuggleRun],
          shipmentsInTransit: [...gameState.shipmentsInTransit, ...newShipments],
          fleet: updatedFleet,
          events: [...gameState.events, event].slice(-CONFIG.ui.eventFeedCap),
        },
      })
    },
  }
}
