import { getCityName } from '../data/cities'
import { CONFIG } from './config'
import type { GameState, LiveEvent, ShipmentInTransit, SmuggleRun, DeliveryRecord } from './gameState'
import { generateContracts } from './contracts'
import { detectionChanceWithBreakdown, smuggleHopDetection } from './detection'
import { makeEvent, routeLabel, appendEvents, checkWinLose, INTERPOL_TIERS } from './engineHelpers'
import { getTierBonus, getSkillEffect } from '../utils/gameHelpers'
import { findRouteBetween } from './pathfinding'

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

  const isIntlRoute    = route !== undefined && INTERPOL_TIERS.has(route.tier)
  const concU          = CONFIG.vehicleUpgrades.effects.concealment
  const concTier       = vehicle?.upgrades.concealment ?? 0
  const piracyMit      = concTier === 2 ? concU.tier2PiracyMitigation : concTier === 1 ? concU.tier1PiracyMitigation : 0
  const isPiracy       = vehicle?.type === 'ship' && isIntlRoute &&
                         Math.random() < CONFIG.economy.piracyChance * Math.max(0, 1 - piracyMit)

  // Compute detection probability upfront — legit cover is per-route only
  const activeLegitRecurring = state.shipmentsInTransit.filter(
    s => !s.isIllicit &&
         s.routeId === shipment.routeId &&
         state.contracts.find(c => c.id === s.contractId)?.isRecurring,
  ).length
  const illicitDetection = (shipment.isIllicit && !isPiracy && route)
    ? detectionChanceWithBreakdown({
        route,
        allRoutes:               state.routes,
        globalHeat:              state.globalHeat,
        inspectorCityId:         state.inspector.currentCityId,
        interpolCityId:          state.interpol.currentCityId,
        unlockedSkills:          state.unlockedSkills,
        concealmentTier:         vehicle?.upgrades.concealment ?? 0,
        activeLegitRecurringCount: activeLegitRecurring,
        interpolAdditionalIds:   state.interpol.additionalCityIds,
      })
    : null
  const illicitProb = illicitDetection?.prob ?? null

  let bustsThisArrival = 0
  let wasPiracy        = false

  if (isPiracy) {
    wasPiracy = true
    const ec = CONFIG.economy
    newReputation = Math.max(0, newReputation - ec.piracyRepLoss)
    newGlobalHeat = Math.min(100, newGlobalHeat + ec.piracyGlobalHeatGain)

    if (vi !== -1 && vehicle) {
      const ransom = Math.round(vehicle.purchasePrice * ec.piracyRansomFraction)
      updatedFleet[vi] = {
        ...updatedFleet[vi]!,
        isImpounded:          true,
        impoundFine:          ransom,
        impoundExpiresOnTurn: state.turn + ec.piracyImpoundWeeks,
      }
      events.push(makeEvent(gameTimeMs,
        `Pirates seized ${vehicle.name} on ${leg}. Cargo lost. Ransom: $${ransom.toLocaleString()} (${ec.piracyImpoundWeeks} weeks). -${ec.piracyRepLoss} rep.`,
        'danger'))
    } else {
      events.push(makeEvent(gameTimeMs,
        `Pirates raided ${leg}. Cargo lost. -${ec.piracyRepLoss} rep.`,
        'danger'))
    }
  } else if (!shipment.isIllicit) {
    // ── Legit delivery ─────────────────────────────────────────────────────────
    const isLastLeg = shipment.legIndex === contract.legs.length - 1
    if (isLastLeg) {
      const payout = Math.round(contract.payout * (1 + cargoBonus))
      newCash += payout
      const bonusStr = cargoBonus > 0 ? ` (+${Math.round(cargoBonus * 100)}% cargo)` : ''
      events.push(makeEvent(gameTimeMs, `${leg} — delivered. +$${payout.toLocaleString()}${bonusStr}`, 'success'))
    } else {
      events.push(makeEvent(gameTimeMs, `${routeLabel(route?.origin ?? contract.legs[shipment.legIndex]!.origin, route?.destination ?? contract.legs[shipment.legIndex]!.destination)} — leg complete, dispatching next leg.`, 'info'))
    }
  } else {
    // ── Illicit delivery ───────────────────────────────────────────────────────
    const prob   = illicitProb ?? 0
    const caught = Math.random() < prob

    if (caught) {
      const ec            = CONFIG.economy
      const repLoss       = isIntlRoute ? ec.interpolBustRepLoss : ec.bustRepLoss
      const heatGain      = isIntlRoute ? ec.interpolBustGlobalHeatGain  : ec.bustGlobalHeatGain
      const routeHeatGain = isIntlRoute ? ec.interpolBustRouteHeatGain   : ec.bustRouteHeatGain
      const flaggedWeeks  = isIntlRoute ? ec.interpolBustFlaggedWeeks    : ec.bustFlaggedWeeks

      bustsThisArrival  = 1
      newReputation     = Math.max(0, newReputation - repLoss)
      newGlobalHeat     = Math.min(100, newGlobalHeat + heatGain)

      const flagReduction  = getSkillEffect(state.unlockedSkills, 'shadow_2', 'flaggedDurationReduction')
      const effectiveWeeks = Math.max(0, flaggedWeeks - flagReduction)

      if (route) {
        updatedRoutes = updatedRoutes.map(r =>
          r.id === route.id
            ? { ...r, heat: Math.min(5, r.heat + routeHeatGain), flaggedTurnsRemaining: effectiveWeeks, consecutiveIllicitRuns: 0 }
            : r,
        )
      }

      const riskStr = ` (${Math.round(prob * 100)}% risk)`
      if (isIntlRoute) {
        if (vi !== -1 && vehicle) {
          updatedFleet.splice(vi, 1)
          events.push(makeEvent(gameTimeMs,
            `Interpol bust: ${leg}. -${repLoss} rep, route flagged ${effectiveWeeks} weeks. ${vehicle.name} permanently seized.${riskStr}`,
            'danger'))
        } else {
          events.push(makeEvent(gameTimeMs,
            `Interpol bust: ${leg}. -${repLoss} rep, route flagged ${effectiveWeeks} weeks.${riskStr}`,
            'danger'))
        }
      } else {
        if (vi !== -1 && vehicle) {
          const avoidChance   = getSkillEffect(state.unlockedSkills, 'network_2', 'impoundAvoidChance')
          const avoidsImpound = avoidChance > 0 && Math.random() < avoidChance
          if (avoidsImpound) {
            events.push(makeEvent(gameTimeMs,
              `Busted: ${leg}. -${repLoss} rep, route flagged ${effectiveWeeks} weeks. ${vehicle.name} evaded impound.${riskStr}`,
              'danger'))
          } else {
            const fine = Math.round(vehicle.purchasePrice * ec.impoundFineMultiplier)
            updatedFleet[vi] = {
              ...updatedFleet[vi]!,
              isImpounded:          true,
              impoundFine:          fine,
              impoundExpiresOnTurn: state.turn + ec.impoundRecoveryWeeks,
            }
            events.push(makeEvent(gameTimeMs,
              `Busted: ${leg}. -${repLoss} rep, route flagged ${effectiveWeeks} weeks. ${vehicle.name} impounded — pay $${fine.toLocaleString()} within ${ec.impoundRecoveryWeeks} weeks to recover.${riskStr}`,
              'danger'))
          }
        } else {
          events.push(makeEvent(gameTimeMs,
            `Busted: ${leg}. -${repLoss} rep, route flagged ${effectiveWeeks} weeks.${riskStr}`,
            'danger'))
        }
      }
    } else {
      // Cleared — only pay out on the last leg
      const isLastLeg = shipment.legIndex === contract.legs.length - 1
      if (isLastLeg) {
        const illicitBonus = getSkillEffect(state.unlockedSkills, 'logistics_3', 'illicitPayoutBonus')
        const payout  = Math.round(contract.payout * (1 + cargoBonus + illicitBonus))
        const gain    = contract.repReward ?? 1
        newCash       = newCash + payout
        newGlobalHeat = Math.min(100, newGlobalHeat + CONFIG.economy.successGlobalHeatGain)
        if (gain > 0) newReputation = Math.min(100, newReputation + gain)

        const repStr   = gain > 0 ? `, +${gain} rep` : ''
        const bonusParts = [
          cargoBonus   > 0 ? `+${Math.round(cargoBonus * 100)}% cargo`   : '',
          illicitBonus > 0 ? `+${Math.round(illicitBonus * 100)}% premium` : '',
        ].filter(Boolean)
        const bonusStr = bonusParts.length > 0 ? ` (${bonusParts.join(', ')})` : ''
        events.push(makeEvent(gameTimeMs,
          `${leg} — cleared. +$${payout.toLocaleString()}${repStr}${bonusStr} (${Math.round(prob * 100)}% risk)`,
          'success'))
      } else {
        const legRoute = contract.legs[shipment.legIndex]
        events.push(makeEvent(gameTimeMs,
          `${routeLabel(legRoute?.origin ?? '', legRoute?.destination ?? '')} — cleared, dispatching next leg. (${Math.round(prob * 100)}% risk)`,
          'info'))
      }

      // Increment route heat & consecutive runs AFTER the detection roll
      if (route) {
        updatedRoutes = updatedRoutes.map(r =>
          r.id === route.id
            ? { ...r, heat: Math.min(5, r.heat + 1), consecutiveIllicitRuns: r.consecutiveIllicitRuns + 1, lastIllicitRunTurn: state.turn }
            : r,
        )
      }
    }
  }

  // ── Weekly stats accumulator ──────────────────────────────────────────────────
  const ws      = state.weeklyStats
  const isLastLeg = shipment.legIndex === contract.legs.length - 1
  const deliveryFailed = bustsThisArrival > 0 || wasPiracy
  const record: DeliveryRecord = {
    origin:        getCityName(contract.origin),
    destination:   getCityName(contract.destination),
    payout:        (deliveryFailed || !isLastLeg) ? 0 : contract.payout,
    isIllicit:     shipment.isIllicit,
    cargoType:     contract.cargoType,
    wasBust:       deliveryFailed,
    risk:          illicitProb,
    riskBreakdown: illicitDetection?.breakdown ?? null,
  }
  const newWeeklyStats = {
    deliveryIncome:     ws.deliveryIncome + (newCash - state.cash),
    contractsCompleted: ws.contractsCompleted + (isLastLeg ? 1 : 0),
    busts:              ws.busts + bustsThisArrival + (wasPiracy ? 1 : 0),
    repFromDeliveries:  ws.repFromDeliveries + (newReputation - state.reputation),
    heatFromDeliveries: ws.heatFromDeliveries + (newGlobalHeat - state.globalHeat),
    deliveries:         isLastLeg ? [...ws.deliveries, record] : ws.deliveries,
  }

  // ── Remove the completed shipment from the leg's shipmentIds ─────────────────
  let updatedContracts = state.contracts.map(c => {
    if (c.id !== contract.id) return c
    const updatedLegs = c.legs.map((l, i) =>
      i === shipment.legIndex
        ? {
            ...l,
            shipmentIds: l.shipmentIds.filter(sid => sid !== shipmentId),
            completedAt: l.shipmentIds.length === 1 ? state.turn : l.completedAt, // last shipment marks completion
          }
        : l,
    )
    return { ...c, legs: updatedLegs }
  })

  // ── Multi-leg: auto-dispatch next leg if pre-assigned ─────────────────────────
  let finalShipments = state.shipmentsInTransit.filter(s => s.id !== shipmentId)
  let finalFleet = updatedFleet

  const updatedContract = updatedContracts.find(c => c.id === contract.id)!
  const thisLeg = updatedContract.legs[shipment.legIndex]!
  const legComplete = thisLeg.shipmentIds.length === 0 && thisLeg.completedAt !== null
  const nextLeg = updatedContract.legs[shipment.legIndex + 1]

  if (legComplete && nextLeg && !bustsThisArrival && !wasPiracy) {
    // Dispatch each pre-assigned vehicle for the next leg
    const nextRoute = state.routes.find(r =>
      r.status === 'open' &&
      r.origin === nextLeg.origin &&
      r.destination === nextLeg.destination,
    )
    if (nextRoute) {
      const newShipmentIds: string[] = []
      for (const preVehicleId of nextLeg.assignedVehicleIds) {
        const preVehicle = finalFleet.find(v => v.id === preVehicleId)
        if (!preVehicle || preVehicle.isImpounded) continue
        const travelDays = nextRoute.travelDays[preVehicle.type]
        if (!travelDays) continue

        const newShipId = `ship_${gameTimeMs}_l${shipment.legIndex + 1}_${preVehicleId}`
        const newShip: ShipmentInTransit = {
          id:               newShipId,
          contractId:       contract.id,
          vehicleId:        preVehicleId,
          routeId:          nextRoute.id,
          legIndex:         shipment.legIndex + 1,
          turnsRemaining:   travelDays,
          totalTurns:       travelDays,
          isIllicit:        shipment.isIllicit,
          isFrozen:         false,
          departureTimeMs:  gameTimeMs,
          frozenDurationMs: 0,
          smuggleRunId:     null,
        }
        finalShipments = [...finalShipments, newShip]
        newShipmentIds.push(newShipId)

        // Vehicle stays isAssigned, update currentShipmentId
        const fvi = finalFleet.findIndex(v => v.id === preVehicleId)
        if (fvi !== -1) {
          finalFleet = [...finalFleet]
          finalFleet[fvi] = { ...finalFleet[fvi]!, isAssigned: true, currentShipmentId: newShipId }
        }

        events.push(makeEvent(gameTimeMs,
          `${preVehicle.name} dispatched for leg 2: ${getCityName(nextLeg.origin)} → ${getCityName(nextLeg.destination)} (${travelDays} day${travelDays > 1 ? 's' : ''}).`,
          'info'))
      }
      // Update next leg's shipmentIds
      updatedContracts = updatedContracts.map(c =>
        c.id === contract.id
          ? {
              ...c,
              legs: c.legs.map((l, i) =>
                i === shipment.legIndex + 1 ? { ...l, shipmentIds: newShipmentIds } : l,
              ),
            }
          : c,
      )
    }
  }

  // ── Recurring auto-redispatch (single-leg legit only) ─────────────────────────
  const runsLeft      = contract.totalRuns - contract.runsCompleted - 1
  const routeFlagged  = contract.isIllicit && (route?.flaggedTurnsRemaining ?? 0) > 0
  const isSingleLeg   = contract.legs.length === 1
  const autoRedispatch = isSingleLeg && contract.isRecurring && runsLeft > 0 &&
                         !bustsThisArrival && !wasPiracy && !routeFlagged

  let finalContracts: typeof state.contracts

  if (autoRedispatch) {
    const newShipmentId2 = `ship_${gameTimeMs}_r${contract.runsCompleted + 1}`
    const newShipment2: ShipmentInTransit = {
      id:               newShipmentId2,
      contractId:       contract.id,
      vehicleId:        shipment.vehicleId,
      routeId:          shipment.routeId,
      legIndex:         0,
      turnsRemaining:   shipment.totalTurns,
      totalTurns:       shipment.totalTurns,
      isIllicit:        shipment.isIllicit,
      isFrozen:         false,
      departureTimeMs:  gameTimeMs,
      frozenDurationMs: 0,
      smuggleRunId:     null,
    }

    const rvi = finalFleet.findIndex(v => v.id === shipment.vehicleId)
    if (rvi !== -1) {
      finalFleet = [...finalFleet]
      finalFleet[rvi] = { ...finalFleet[rvi]!, isAssigned: true, currentShipmentId: newShipmentId2 }
    }

    finalShipments = [...finalShipments, newShipment2]
    finalContracts = updatedContracts.map(c =>
      c.id === contract.id
        ? {
            ...c,
            runsCompleted: c.runsCompleted + 1,
            isAssigned: true,
            assignedVehicleId: shipment.vehicleId,
            legs: c.legs.map((l, i) => i === 0
              ? { ...l, assignedVehicleIds: [shipment.vehicleId], shipmentIds: [newShipmentId2], completedAt: null }
              : l,
            ),
          }
        : c,
    )
  } else {
    if (contract.isRecurring && runsLeft > 0 && (bustsThisArrival > 0 || wasPiracy || routeFlagged)) {
      events.push(makeEvent(gameTimeMs,
        `Recurring contract cancelled (${runsLeft} run${runsLeft !== 1 ? 's' : ''} remaining).`,
        'warning'))
    }

    const contractDone = !autoRedispatch && (isLastLeg && legComplete || wasPiracy || bustsThisArrival > 0)

    if (contractDone) {
      finalContracts = updatedContracts.filter(c => c.id !== contract.id)
    } else {
      finalContracts = updatedContracts
    }
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
    hasCompletedFirstIllicit: state.hasCompletedFirstIllicit || shipment.isIllicit,
    weeklyStats:             newWeeklyStats,
    recentIllicitCompletions: shipment.isIllicit && !bustsThisArrival && !wasPiracy && isLastLeg
      ? [...(state.recentIllicitCompletions ?? []), shipment.routeId]
      : (state.recentIllicitCompletions ?? []),
  }

  if (!autoRedispatch && isLastLeg) {
    const fresh = generateContracts(next)
    if (fresh.length > 0) next = { ...next, contracts: [...next.contracts, ...fresh] }
  }

  next = appendEvents(next, events)
  next = checkWinLose(next, gameTimeMs)

  return { state: next, events }
}

// ── Smuggle run hop arrival ──────────────────────────────────────────────────

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
    return {
      state: { ...state, shipmentsInTransit: finalShipments },
      events: [],
    }
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

  // Legit cover
  const activeLegitRecurring = state.shipmentsInTransit.filter(
    s => !s.isIllicit && !s.smuggleRunId,
  ).length

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
    // ── BUSTED ────────────────────────────────────────────────────────────────
    const ec = CONFIG.economy
    const repLoss = isIntlRoute ? ec.interpolBustRepLoss : ec.bustRepLoss
    const heatGain = isIntlRoute ? ec.interpolBustGlobalHeatGain : ec.bustGlobalHeatGain
    const routeHeatGain = isIntlRoute ? ec.interpolBustRouteHeatGain : ec.bustRouteHeatGain
    const flaggedWeeks = isIntlRoute ? ec.interpolBustFlaggedWeeks : ec.bustFlaggedWeeks
    const flagReduction = getSkillEffect(state.unlockedSkills, 'shadow_2', 'flaggedDurationReduction')
    const effectiveWeeks = Math.max(0, flaggedWeeks - flagReduction)

    newReputation = Math.max(0, newReputation - repLoss)
    newGlobalHeat = Math.min(100, newGlobalHeat + heatGain)

    // Flag the route
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
        // Interpol: permanent seizure
        updatedFleet.splice(vi, 1)
      } else {
        // Inspector: impound with fine option
        const avoidChance = getSkillEffect(state.unlockedSkills, 'network_2', 'impoundAvoidChance')
        const avoidsImpound = avoidChance > 0 && Math.random() < avoidChance
        if (!avoidsImpound) {
          const fine = Math.round(vehicle.purchasePrice * ec.impoundFineMultiplier)
          updatedFleet[vi] = {
            ...vehicle,
            isAssigned: false,
            currentShipmentId: null,
            isImpounded: true,
            impoundFine: fine,
            impoundExpiresOnTurn: state.turn + ec.impoundRecoveryWeeks,
          }
        } else {
          updatedFleet[vi] = { ...vehicle, isAssigned: false, currentShipmentId: null }
        }
      }
    }

    // Mark run as busted
    updatedRuns = updatedRuns.map(r =>
      r.id === run.id
        ? {
            ...r,
            status: 'busted' as const,
            hops: r.hops.map((h, i) =>
              i === run.currentHopIndex ? { ...h, status: 'busted' as const } : h,
            ),
          }
        : r,
    )

    const vehicleNames = convoyVehicles.map(v => v.name).join(', ')
    const seizureMsg = isIntlRoute
      ? `${vehicleNames} permanently seized.`
      : `${vehicleNames} impounded.`
    events.push(makeEvent(gameTimeMs,
      `Smuggling bust at ${getCityName(hop.destination)}: ${run.volume} ${commodityName} seized on ${hopLabel}. -${repLoss} rep. ${seizureMsg} (${Math.round(prob * 100)}% risk)`,
      'danger'))
  } else {
    // ── CLEARED ───────────────────────────────────────────────────────────────
    // Increment route heat on this segment
    if (route) {
      updatedRoutes = updatedRoutes.map(r =>
        r.id === route.id
          ? { ...r, heat: Math.min(5, r.heat + CONFIG.smuggling.heatOnSuccess.routeHeatGain), consecutiveIllicitRuns: r.consecutiveIllicitRuns + 1, lastIllicitRunTurn: state.turn }
          : r,
      )
    }

    if (isLastHop) {
      // ── FINAL DELIVERY ──────────────────────────────────────────────────────
      const payout = run.volume * run.sellPricePerUnit
      newCash += payout
      newGlobalHeat = Math.min(100, newGlobalHeat + CONFIG.smuggling.heatOnSuccess.globalHeatGain)
      newReputation = Math.min(100, newReputation + run.repReward)

      // Free all vehicles
      for (const vId of run.vehicleIds) {
        const vi = updatedFleet.findIndex(v => v.id === vId)
        if (vi !== -1) {
          updatedFleet[vi] = { ...updatedFleet[vi]!, isAssigned: false, currentShipmentId: null }
        }
      }

      // Mark run completed
      updatedRuns = updatedRuns.map(r =>
        r.id === run.id
          ? {
              ...r,
              status: 'completed' as const,
              completedAtTurn: state.turn,
              hops: r.hops.map((h, i) =>
                i === run.currentHopIndex ? { ...h, status: 'cleared' as const } : h,
              ),
            }
          : r,
      )

      const profit = payout - (run.volume * run.buyPricePerUnit)
      events.push(makeEvent(gameTimeMs,
        `Smuggling complete: ${run.volume} ${commodityName} delivered to ${getCityName(hop.destination)}. +$${payout.toLocaleString()} (profit $${profit.toLocaleString()}), +${run.repReward} rep. (${Math.round(prob * 100)}% risk)`,
        'success'))
    } else {
      // ── INTERMEDIATE HOP — dispatch next hop ─────────────────────────────────
      const nextHop = run.hops[run.currentHopIndex + 1]!
      const nextRoute = findRouteBetween(nextHop.origin, nextHop.destination, state.routes)

      // Mark current hop cleared, advance index
      updatedRuns = updatedRuns.map(r =>
        r.id === run.id
          ? {
              ...r,
              currentHopIndex: r.currentHopIndex + 1,
              hops: r.hops.map((h, i) =>
                i === run.currentHopIndex
                  ? { ...h, status: 'cleared' as const }
                  : i === run.currentHopIndex + 1
                  ? { ...h, status: 'in_transit' as const, departureTimeMs: gameTimeMs }
                  : h,
              ),
            }
          : r,
      )

      // Create shipments for next hop
      if (nextRoute) {
        const nextShipmentIds: string[] = []
        for (const v of convoyVehicles) {
          const travelDays = nextRoute.travelDays[v.type]
          if (!travelDays) continue
          const newShipId = `ship_smg_${gameTimeMs}_${v.id}`
          finalShipments.push({
            id: newShipId,
            contractId: '',
            vehicleId: v.id,
            routeId: nextRoute.id,
            legIndex: run.currentHopIndex + 1,
            turnsRemaining: travelDays,
            totalTurns: travelDays,
            isIllicit: true,
            isFrozen: false,
            departureTimeMs: gameTimeMs,
            frozenDurationMs: 0,
            smuggleRunId: run.id,
          })
          nextShipmentIds.push(newShipId)

          // Update vehicle's currentShipmentId
          const vi = updatedFleet.findIndex(f => f.id === v.id)
          if (vi !== -1) {
            updatedFleet[vi] = { ...updatedFleet[vi]!, currentShipmentId: newShipId }
          }
        }

        // Update the run's next hop shipment IDs
        updatedRuns = updatedRuns.map(r =>
          r.id === run.id
            ? {
                ...r,
                hops: r.hops.map((h, i) =>
                  i === run.currentHopIndex + 1 ? { ...h, shipmentIds: nextShipmentIds } : h,
                ),
              }
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
  const deliveryFailed = caught
  const record: DeliveryRecord = {
    origin: getCityName(run.sourceCity),
    destination: getCityName(run.destinationCity),
    payout: deliveryFailed ? 0 : (isLastHop ? run.volume * run.sellPricePerUnit : 0),
    isIllicit: true,
    cargoType: commodityName,
    wasBust: deliveryFailed,
    risk: prob,
    riskBreakdown: detection?.breakdown ?? null,
  }
  const newWeeklyStats = {
    deliveryIncome: ws.deliveryIncome + (newCash - state.cash),
    contractsCompleted: ws.contractsCompleted + (isLastHop && !caught ? 1 : 0),
    busts: ws.busts + (caught ? 1 : 0),
    repFromDeliveries: ws.repFromDeliveries + (newReputation - state.reputation),
    heatFromDeliveries: ws.heatFromDeliveries + (newGlobalHeat - state.globalHeat),
    deliveries: (isLastHop || caught) ? [...ws.deliveries, record] : ws.deliveries,
  }

  let next: GameState = {
    ...state,
    cash: newCash,
    reputation: newReputation,
    globalHeat: newGlobalHeat,
    routes: updatedRoutes,
    shipmentsInTransit: finalShipments,
    fleet: updatedFleet,
    smuggleRuns: updatedRuns,
    turnsWithoutIllicitActivity: 0,
    hasCompletedFirstIllicit: true,
    weeklyStats: newWeeklyStats,
  }

  next = appendEvents(next, events)
  next = checkWinLose(next, gameTimeMs)

  return { state: next, events }
}
