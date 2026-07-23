import { getCityName } from '../data/cities'
import { CONFIG } from './config'
import type { GameState, LiveEvent, DeliveryRecord } from './gameState'
import { getActiveLegitCount } from './gameState'
import { smuggleHopDetection } from './detection'
import { makeEvent, appendEvents, checkWinLose, INTERPOL_TIERS } from './engineHelpers'
import { getSkillEffect } from '../utils/gameHelpers'
import { findRouteBetween } from './pathfinding'

/**
 * Resolve a smuggling run hop arrival.
 * Handles per-hop detection rolls, bust/clear logic, hop advancement,
 * final delivery payout, and vehicle impound/seizure.
 */
export function resolveSmuggleHopArrival(
  state: GameState,
  shipmentId: string,
  gameTimeMs: number,
): { state: GameState; events: LiveEvent[] } {
  if (state.phase === 'game_over') return { state, events: [] }

  const shipment = state.shipmentsInTransit.find(s => s.id === shipmentId)
  if (!shipment || !shipment.smuggleRunId) return { state, events: [] }

  const run = state.smuggleRuns.find(r => r.id === shipment.smuggleRunId)
  if (!run || run.status !== 'in_transit') return { state, events: [] }

  const hop = run.hops[run.currentHopIndex]
  if (!hop) return { state, events: [] }

  // Only process once per hop — wait for all vehicles to arrive (use first arrival)
  const isFirstVehicleToArrive = hop.shipmentIds[0] === shipmentId

  // Remove this shipment
  let finalShipments = state.shipmentsInTransit.filter(s => s.id !== shipmentId)

  // If not first vehicle, just remove the shipment and wait
  if (!isFirstVehicleToArrive) {
    return { state: { ...state, shipmentsInTransit: finalShipments }, events: [] }
  }

  // Remove ALL shipments for this hop (all vehicles arrive together logically)
  finalShipments = finalShipments.filter(s => !hop.shipmentIds.includes(s.id))

  const events: LiveEvent[] = []
  let newCash = state.cash
  let newReputation = state.reputation
  let newGlobalHeat = state.globalHeat
  let updatedRoutes = state.routes
  let updatedFleet = [...state.fleet]
  let updatedRuns = state.smuggleRuns
  let deliveredPayout = 0

  const route = state.routes.find(r => r.id === hop.routeId)
  const isIntlRoute = route !== undefined && INTERPOL_TIERS.has(route.tier)
  const commodityDef = CONFIG.smuggling.commodities[run.commodityKey as keyof typeof CONFIG.smuggling.commodities]
  const commodityName = commodityDef?.displayName ?? run.commodityKey

  // Compute min concealment across convoy
  const convoyVehicles = run.vehicleIds
    .map(id => updatedFleet.find(v => v.id === id))
    .filter(Boolean) as typeof updatedFleet
  const minConcealment = convoyVehicles.length > 0
    ? Math.min(...convoyVehicles.map(v => v.upgrades.concealment)) as 0 | 1 | 2
    : 0 as const

  const activeLegitRecurring = getActiveLegitCount(state.shipmentsInTransit)

  // Detection roll
  const detection = route ? smuggleHopDetection({
    routeSegment: route,
    allRoutes: state.routes,
    globalHeat: state.globalHeat,
    arrivalCityId: hop.destination,
    inspectorCityId: state.inspector.currentCityId,
    interpolCityId: state.interpol.currentCityId,
    interpolAdditionalIds: state.interpol.additionalCityIds,
    unlockedSkills: state.unlockedSkills,
    reputation: state.reputation,
    minConcealmentTier: minConcealment,
    activeLegitRecurringCount: activeLegitRecurring,
    vehicleCount: run.vehicleIds.length,
    volume: run.volume,
  }) : null
  const prob = detection?.prob ?? 0
  const caught = Math.random() < prob

  const hopLabel = `${getCityName(hop.origin)} → ${getCityName(hop.destination)}`
  const isLastHop = run.currentHopIndex === run.hops.length - 1

  if (caught) {
    // ── BUSTED ──────────────────────────────────────────────────────────────
    const ec = CONFIG.economy
    const repLoss = isIntlRoute ? ec.interpolBustRepLoss : ec.bustRepLoss
    const heatGain = isIntlRoute ? ec.interpolBustGlobalHeatGain : ec.bustGlobalHeatGain
    const routeHeatGain = isIntlRoute ? ec.interpolBustRouteHeatGain : ec.bustRouteHeatGain
    const flaggedWeeks = isIntlRoute ? ec.interpolBustFlaggedWeeks : ec.bustFlaggedWeeks
    const flagReduction = getSkillEffect(state.unlockedSkills, 'shadow_2', 'flaggedDurationReduction')
    const effectiveWeeks = Math.max(0, flaggedWeeks - flagReduction)

    newReputation = Math.max(0, newReputation - repLoss)
    newGlobalHeat = Math.min(100, newGlobalHeat + heatGain)

    if (route) {
      updatedRoutes = updatedRoutes.map(r =>
        r.id === route.id
          ? { ...r, heat: Math.min(5, r.heat + routeHeatGain), flaggedTurnsRemaining: effectiveWeeks, consecutiveIllicitRuns: 0 }
          : r,
      )
    }

    // Impound/seize ALL convoy vehicles
    for (const vId of run.vehicleIds) {
      const vi = updatedFleet.findIndex(v => v.id === vId)
      if (vi === -1) continue
      const vehicle = updatedFleet[vi]!

      if (isIntlRoute) {
        updatedFleet.splice(vi, 1)
      } else {
        const avoidChance = getSkillEffect(state.unlockedSkills, 'network_2', 'impoundAvoidChance')
        const avoidsImpound = avoidChance > 0 && Math.random() < avoidChance
        if (!avoidsImpound) {
          const fine = Math.round(vehicle.purchasePrice * ec.impoundFineMultiplier)
          updatedFleet[vi] = {
            ...vehicle, isAssigned: false, currentShipmentId: null,
            isImpounded: true, impoundFine: fine,
            impoundExpiresOnTurn: state.turn + ec.impoundRecoveryWeeks,
            impoundReason: 'bust' as const,
          }
        } else {
          updatedFleet[vi] = { ...vehicle, isAssigned: false, currentShipmentId: null }
        }
      }
    }

    updatedRuns = updatedRuns.map(r =>
      r.id === run.id
        ? { ...r, status: 'busted' as const, hops: r.hops.map((h, i) => i === run.currentHopIndex ? { ...h, status: 'busted' as const } : h) }
        : r,
    )

    const vehicleNames = convoyVehicles.map(v => v.name).join(', ')
    const seizureMsg = isIntlRoute ? `${vehicleNames} permanently seized.` : `${vehicleNames} impounded.`
    events.push(makeEvent(gameTimeMs,
      `Smuggling bust at ${getCityName(hop.destination)}: ${run.volume} ${commodityName} seized on ${hopLabel}. -${repLoss} rep. ${seizureMsg} (${Math.round(prob * 100)}% risk)`,
      'danger'))
  } else {
    // ── CLEARED ─────────────────────────────────────────────────────────────
    if (route) {
      updatedRoutes = updatedRoutes.map(r =>
        r.id === route.id
          ? { ...r, heat: Math.min(5, r.heat + CONFIG.smuggling.heatOnSuccess.routeHeatGain), consecutiveIllicitRuns: r.consecutiveIllicitRuns + 1, lastIllicitRunTurn: state.turn }
          : r,
      )
    }

    if (isLastHop) {
      const premiumMult = state.unlockedSkills.includes('logistics_3')
        ? 1 + CONFIG.skills.effects.logistics_3.commodityPremiumBonus
        : 1.0
      // Use current market index at delivery time so timing deliveries matters
      const marketIdx = state.commodityPrices?.[run.commodityKey]?.index ?? 1.0
      const baseSellUnit = (commodityDef?.sellPrices as Record<string, number> | undefined)?.[run.destinationCity] ?? run.sellPricePerUnit
      const currentSellUnit = Math.round(baseSellUnit * marketIdx)
      const payout = Math.round(run.volume * currentSellUnit * premiumMult)
      deliveredPayout = payout
      newCash += payout
      newGlobalHeat = Math.min(100, newGlobalHeat + CONFIG.smuggling.heatOnSuccess.globalHeatGain)
      // Scale rep by market demand at delivery time: high demand = more rep, low demand = less
      const actualRepReward = Math.max(1, Math.round(run.repReward * marketIdx))
      newReputation = Math.min(100, newReputation + actualRepReward)

      for (const vId of run.vehicleIds) {
        const vi = updatedFleet.findIndex(v => v.id === vId)
        if (vi !== -1) updatedFleet[vi] = { ...updatedFleet[vi]!, isAssigned: false, currentShipmentId: null }
      }

      updatedRuns = updatedRuns.map(r =>
        r.id === run.id
          ? { ...r, status: 'completed' as const, completedAtTurn: state.turn, hops: r.hops.map((h, i) => i === run.currentHopIndex ? { ...h, status: 'cleared' as const } : h) }
          : r,
      )

      const profit = payout - (run.volume * run.buyPricePerUnit)
      const demandNote = marketIdx >= 1.05 ? ` (high demand ×${marketIdx.toFixed(1)})` : marketIdx <= 0.95 ? ` (low demand ×${marketIdx.toFixed(1)})` : ''
      events.push(makeEvent(gameTimeMs,
        `Smuggling complete: ${run.volume} ${commodityName} delivered to ${getCityName(hop.destination)}. +$${payout.toLocaleString()} (profit $${profit.toLocaleString()}), +${actualRepReward} rep${demandNote}. (${Math.round(prob * 100)}% risk)`,
        'success'))
    } else {
      // Intermediate hop — dispatch next hop
      const nextHop = run.hops[run.currentHopIndex + 1]!
      const nextRoute = findRouteBetween(nextHop.origin, nextHop.destination, state.routes)

      updatedRuns = updatedRuns.map(r =>
        r.id === run.id
          ? {
              ...r, currentHopIndex: r.currentHopIndex + 1,
              hops: r.hops.map((h, i) =>
                i === run.currentHopIndex ? { ...h, status: 'cleared' as const }
                  : i === run.currentHopIndex + 1 ? { ...h, status: 'in_transit' as const, departureTimeMs: gameTimeMs }
                  : h,
              ),
            }
          : r,
      )

      if (nextRoute) {
        const nextShipmentIds: string[] = []
        for (const v of convoyVehicles) {
          const travelDays = nextRoute.travelDays[v.type]
          if (!travelDays) continue
          const newShipId = `ship_smg_${gameTimeMs}_${v.id}`
          finalShipments.push({
            id: newShipId, contractId: '', vehicleId: v.id,
            routeId: nextRoute.id, legIndex: run.currentHopIndex + 1,
            turnsRemaining: travelDays, totalTurns: travelDays,
            isIllicit: true, isFrozen: false,
            departureTimeMs: gameTimeMs, frozenDurationMs: 0,
            smuggleRunId: run.id, reversed: nextRoute.origin !== nextHop.origin,
          })
          nextShipmentIds.push(newShipId)
          const vi = updatedFleet.findIndex(f => f.id === v.id)
          if (vi !== -1) updatedFleet[vi] = { ...updatedFleet[vi]!, currentShipmentId: newShipId }
        }
        updatedRuns = updatedRuns.map(r =>
          r.id === run.id
            ? { ...r, hops: r.hops.map((h, i) => i === run.currentHopIndex + 1 ? { ...h, shipmentIds: nextShipmentIds } : h) }
            : r,
        )
      }

      events.push(makeEvent(gameTimeMs,
        `${commodityName} cleared ${getCityName(hop.destination)}, en route to ${getCityName(nextHop.destination)}. (${Math.round(prob * 100)}% risk)`,
        'info'))
    }
  }

  // Weekly stats
  const ws = state.weeklyStats
  const record: DeliveryRecord = {
    origin: getCityName(run.sourceCity),
    destination: getCityName(run.destinationCity),
    payout: caught ? 0 : deliveredPayout,
    isIllicit: true, cargoType: commodityName, wasBust: caught,
    risk: prob, riskBreakdown: detection?.breakdown ?? null,
  }

  let next: GameState = {
    ...state,
    cash: newCash, reputation: newReputation, globalHeat: newGlobalHeat,
    routes: updatedRoutes, shipmentsInTransit: finalShipments,
    fleet: updatedFleet, smuggleRuns: updatedRuns,
    turnsWithoutIllicitActivity: 0, hasCompletedFirstIllicit: true,
    weeklyStats: {
      deliveryIncome: ws.deliveryIncome + (newCash - state.cash),
      contractsCompleted: ws.contractsCompleted + (isLastHop && !caught ? 1 : 0),
      busts: ws.busts + (caught ? 1 : 0),
      repFromDeliveries: ws.repFromDeliveries + (newReputation - state.reputation),
      heatFromDeliveries: ws.heatFromDeliveries + (newGlobalHeat - state.globalHeat),
      deliveries: (isLastHop || caught) ? [...ws.deliveries, record] : ws.deliveries,
      expenseBreakdown: ws.expenseBreakdown,
    },
  }

  next = appendEvents(next, events)
  next = checkWinLose(next, gameTimeMs)

  return { state: next, events }
}
