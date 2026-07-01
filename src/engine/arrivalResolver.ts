import { getCityName } from '../data/cities'
import { CONFIG } from './config'
import type { GameState, LiveEvent, ShipmentInTransit, DeliveryRecord } from './gameState'
import { generateContracts } from './contracts'
import { detectionChance } from './detection'
import { makeEvent, routeLabel, appendEvents, checkWinLose, INTERPOL_TIERS } from './engineHelpers'
import { getTierBonus } from '../utils/gameHelpers'

// ── Arrival resolution (fires when a shipment reaches its destination) ────────

export function resolveArrival(
  state: GameState,
  shipmentId: string,
  gameTimeMs: number,
): { state: GameState; events: LiveEvent[] } {
  if (state.phase === 'game_over') return { state, events: [] }

  const shipment = state.shipmentsInTransit.find(s => s.id === shipmentId)
  if (!shipment) return { state, events: [] }

  const contract = state.contracts.find(c => c.id === shipment.contractId)
  if (!contract) return { state, events: [] }

  const events: LiveEvent[] = []
  let newCash       = state.cash
  let newReputation = state.reputation
  let newGlobalHeat = state.globalHeat
  let updatedRoutes = state.routes
  const updatedFleet = [...state.fleet]

  // Free the vehicle
  const vi      = updatedFleet.findIndex(v => v.id === shipment.vehicleId)
  const vehicle = state.fleet.find(v => v.id === shipment.vehicleId)
  if (vi !== -1) updatedFleet[vi] = { ...updatedFleet[vi]!, isAssigned: false, currentShipmentId: null }

  const route         = state.routes.find(r => r.id === shipment.routeId)
  const leg           = routeLabel(contract.origin, contract.destination)
  const cu            = CONFIG.vehicleUpgrades.effects.cargo
  const cargoBonus    = getTierBonus(vehicle?.upgrades.cargo ?? 0, cu.tier1PayoutBonus, cu.tier2PayoutBonus)

  let bustsThisArrival = 0
  let wasPiracy        = false

  if (!shipment.isIllicit) {
    // ── Legit delivery ─────────────────────────────────────────────────────────
    const payout = Math.round(contract.payout * (1 + cargoBonus))
    newCash += payout
    const bonusStr = cargoBonus > 0 ? ` (+${Math.round(cargoBonus * 100)}% cargo)` : ''
    events.push(makeEvent(gameTimeMs, `${leg} — delivered. +$${payout.toLocaleString()}${bonusStr}`, 'success'))
  } else {
    // ── Illicit delivery ───────────────────────────────────────────────────────
    const isIntlRoute = route !== undefined && INTERPOL_TIERS.has(route.tier)

    if (vehicle?.type === 'ship' && isIntlRoute && Math.random() < CONFIG.economy.piracyChance) {
      wasPiracy = true
      events.push(makeEvent(gameTimeMs, `Piracy: ${leg}. Cargo lost.`, 'warning'))
    } else {
      const activeLegitRecurring = state.shipmentsInTransit.filter(
        s => !s.isIllicit && state.contracts.find(c => c.id === s.contractId)?.isRecurring,
      ).length

      const prob = route
        ? detectionChance(route, state.routes, newGlobalHeat,
            state.inspector.currentCityId, state.interpol.currentCityId,
            state.unlockedSkills, vehicle?.upgrades.concealment ?? 0, activeLegitRecurring)
        : 0
      const caught = Math.random() < prob

      if (caught) {
        const ec            = CONFIG.economy
        const repLoss       = isIntlRoute ? ec.interpolBustRepLoss        : ec.bustRepLoss
        const heatGain      = isIntlRoute ? ec.interpolBustGlobalHeatGain  : ec.bustGlobalHeatGain
        const routeHeatGain = isIntlRoute ? ec.interpolBustRouteHeatGain   : ec.bustRouteHeatGain
        const flaggedWeeks  = isIntlRoute ? ec.interpolBustFlaggedWeeks    : ec.bustFlaggedWeeks

        bustsThisArrival  = 1
        newReputation     = Math.max(0, newReputation - repLoss)
        newGlobalHeat     = Math.min(100, newGlobalHeat + heatGain)

        if (route) {
          updatedRoutes = updatedRoutes.map(r =>
            r.id === route.id
              ? { ...r, heat: Math.min(5, r.heat + routeHeatGain), flaggedTurnsRemaining: flaggedWeeks, consecutiveIllicitRuns: 0 }
              : r,
          )
        }

        if (isIntlRoute) {
          // Interpol permanently seizes the vehicle — no recovery possible
          if (vi !== -1 && vehicle) {
            updatedFleet.splice(vi, 1)
            events.push(makeEvent(gameTimeMs,
              `Interpol bust: ${leg}. -${repLoss} rep, route flagged ${flaggedWeeks} weeks. ${vehicle.name} permanently seized.`,
              'danger'))
          } else {
            events.push(makeEvent(gameTimeMs,
              `Interpol bust: ${leg}. -${repLoss} rep, route flagged ${flaggedWeeks} weeks.`,
              'danger'))
          }
        } else {
          // Inspector — impound with fine; player can recover within window
          if (vi !== -1 && vehicle) {
            const fine = Math.round(vehicle.purchasePrice * ec.impoundFineMultiplier)
            updatedFleet[vi] = {
              ...updatedFleet[vi]!,
              isImpounded:          true,
              impoundFine:          fine,
              impoundExpiresOnTurn: state.turn + ec.impoundRecoveryWeeks,
            }
            events.push(makeEvent(gameTimeMs,
              `Busted: ${leg}. -${repLoss} rep, route flagged ${flaggedWeeks} weeks. ${vehicle.name} impounded — pay $${fine.toLocaleString()} within ${ec.impoundRecoveryWeeks} weeks to recover.`,
              'danger'))
          } else {
            events.push(makeEvent(gameTimeMs,
              `Busted: ${leg}. -${repLoss} rep, route flagged ${flaggedWeeks} weeks.`,
              'danger'))
          }
        }
      } else {
        // Cleared
        const payout  = Math.round(contract.payout * (1 + cargoBonus))
        const gain    = contract.repReward ?? 1
        newCash       = newCash + payout
        newGlobalHeat = Math.min(100, newGlobalHeat + CONFIG.economy.successGlobalHeatGain)
        if (gain > 0) newReputation = Math.min(100, newReputation + gain)

        const repStr   = gain > 0 ? `, +${gain} rep` : ''
        const bonusStr = cargoBonus > 0 ? ` (+${Math.round(cargoBonus * 100)}% cargo)` : ''
        events.push(makeEvent(gameTimeMs,
          `${leg} — cleared. +$${payout.toLocaleString()}${repStr}${bonusStr} (${Math.round(prob * 100)}% risk)`,
          'success'))
      }
    }
  }

  // ── Update weeklyStats accumulator ────────────────────────────────────────────
  const ws      = state.weeklyStats
  const record: DeliveryRecord = {
    origin:      getCityName(contract.origin),
    destination: getCityName(contract.destination),
    payout:      bustsThisArrival > 0 ? 0 : contract.payout,
    isIllicit:   shipment.isIllicit,
    cargoType:   contract.cargoType,
    wasBust:     bustsThisArrival > 0,
  }
  const newWeeklyStats = {
    deliveryIncome:     ws.deliveryIncome + (newCash - state.cash),
    contractsCompleted: ws.contractsCompleted + 1,
    busts:              ws.busts + bustsThisArrival,
    repFromDeliveries:  ws.repFromDeliveries + (newReputation - state.reputation),
    heatFromDeliveries: ws.heatFromDeliveries + (newGlobalHeat - state.globalHeat),
    deliveries:         [...ws.deliveries, record],
  }

  // ── Recurring auto-redispatch ──────────────────────────────────────────────────
  const runsLeft      = contract.totalRuns - contract.runsCompleted - 1
  const routeFlagged  = contract.isIllicit && (route?.flaggedTurnsRemaining ?? 0) > 0
  const autoRedispatch = contract.isRecurring && runsLeft > 0 && !bustsThisArrival && !wasPiracy && !routeFlagged

  let finalShipments: typeof state.shipmentsInTransit
  let finalContracts: typeof state.contracts
  let finalFleet = updatedFleet

  if (autoRedispatch) {
    const newShipmentId = `ship_${gameTimeMs}_r${contract.runsCompleted + 1}`
    const newShipment: ShipmentInTransit = {
      id:               newShipmentId,
      contractId:       contract.id,
      vehicleId:        shipment.vehicleId,
      routeId:          shipment.routeId,
      turnsRemaining:   shipment.totalTurns,
      totalTurns:       shipment.totalTurns,
      isIllicit:        shipment.isIllicit,
      isFrozen:         false,
      departureTimeMs:  gameTimeMs,
      frozenDurationMs: 0,
    }

    // Re-assign vehicle (freed at top — lock it back in)
    const rvi = finalFleet.findIndex(v => v.id === shipment.vehicleId)
    if (rvi !== -1) {
      finalFleet = [...finalFleet]
      finalFleet[rvi] = { ...finalFleet[rvi]!, isAssigned: true, currentShipmentId: newShipmentId }
    }

    // Increment route heat for the new illicit run (mirrors assignVehicle)
    if (contract.isIllicit && route) {
      updatedRoutes = updatedRoutes.map(r =>
        r.id === route.id
          ? { ...r, heat: Math.min(5, r.heat + 1), consecutiveIllicitRuns: r.consecutiveIllicitRuns + 1, lastIllicitRunTurn: state.turn }
          : r,
      )
    }

    // No extra log — the delivery event already shows the payout; recurring status is visible on the contract card.

    finalShipments = [...state.shipmentsInTransit.filter(s => s.id !== shipmentId), newShipment]
    finalContracts = state.contracts.map(c =>
      c.id === contract.id
        ? { ...c, runsCompleted: c.runsCompleted + 1, isAssigned: true, assignedVehicleId: shipment.vehicleId }
        : c,
    )
  } else {
    if (contract.isRecurring && runsLeft > 0 && (bustsThisArrival > 0 || wasPiracy || routeFlagged)) {
      events.push(makeEvent(gameTimeMs,
        `Recurring contract cancelled (${runsLeft} run${runsLeft !== 1 ? 's' : ''} remaining).`,
        'warning'))
    }
    finalShipments = state.shipmentsInTransit.filter(s => s.id !== shipmentId)
    finalContracts = state.contracts.filter(c => c.id !== shipment.contractId)
  }

  let next: GameState = {
    ...state,
    cash:                    newCash,
    reputation:              newReputation,
    globalHeat:              newGlobalHeat,
    routes:                  updatedRoutes,
    shipmentsInTransit:      finalShipments,
    contracts:               finalContracts,
    fleet:                   finalFleet,
    turnsWithoutIllicitActivity: shipment.isIllicit ? 0 : state.turnsWithoutIllicitActivity,
    weeklyStats:             newWeeklyStats,
  }

  // Top up contract board immediately (skip if recurring still occupies the slot)
  if (!autoRedispatch) {
    const fresh = generateContracts(next)
    if (fresh.length > 0) next = { ...next, contracts: [...next.contracts, ...fresh] }
  }

  next = appendEvents(next, events)
  next = checkWinLose(next)

  return { state: next, events }
}
