import { describe, it, expect } from 'vitest'
import { getNetWorth, getMaintenanceCost, getNetworkCities, getActiveLegitCount, canEstablishRoute } from '../gameState'
import type { GameState, Vehicle, Route, ShipmentInTransit } from '../gameState'
import { CONFIG } from '../config'

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1',
    type: 'truck',
    name: 'Truck #1',
    purchasePrice: 20000,
    maintenancePerTurn: 275,
    capacity: 20,
    speedMin: 1,
    speedMax: 3,
    resaleValue: 12000,
    isAssigned: false,
    currentShipmentId: null,
    upgrades: { cargo: 0, engine: 0, concealment: 0, range: 0 },
    isImpounded: false,
    impoundFine: null,
    impoundExpiresOnTurn: null,
    impoundReason: null,
    ...overrides,
  }
}

function makeRoute(origin: string, destination: string, overrides: Partial<Route> = {}): Route {
  return {
    id: `route_${origin}_${destination}`,
    origin,
    destination,
    tier: 'domestic',
    status: 'open',
    heat: 0,
    turnsUntilOpen: null,
    openAtMs: null,
    allowedVehicles: ['truck', 'plane'],
    travelDays: { truck: 2, plane: 1 },
    flaggedTurnsRemaining: 0,
    lastIllicitRunTurn: null,
    consecutiveIllicitRuns: 0,
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ShipmentInTransit> = {}): ShipmentInTransit {
  return {
    id: 's1',
    contractId: 'c1',
    vehicleId: 'v1',
    routeId: 'route_a_b',
    legIndex: 0,
    turnsRemaining: 2,
    totalTurns: 2,
    isIllicit: false,
    isFrozen: false,
    departureTimeMs: 0,
    frozenDurationMs: 0,
    smuggleRunId: null,
    reversed: false,
    ...overrides,
  }
}

describe('getNetWorth', () => {
  it('sums cash and fleet resale value', () => {
    const state = {
      cash: 5000,
      fleet: [makeVehicle({ resaleValue: 12000 }), makeVehicle({ id: 'v2', resaleValue: 8000 })],
    } as GameState
    expect(getNetWorth(state)).toBe(25000)
  })

  it('returns just cash with empty fleet', () => {
    const state = { cash: 10000, fleet: [] } as unknown as GameState
    expect(getNetWorth(state)).toBe(10000)
  })
})

describe('getMaintenanceCost', () => {
  it('sums fleet maintenance', () => {
    const state = {
      fleet: [makeVehicle({ maintenancePerTurn: 275 }), makeVehicle({ id: 'v2', maintenancePerTurn: 650 })],
      unlockedSkills: [],
    } as unknown as GameState
    expect(getMaintenanceCost(state)).toBe(925)
  })

  it('applies logistics_1 multiplier', () => {
    const state = {
      fleet: [makeVehicle({ maintenancePerTurn: 1000 })],
      unlockedSkills: ['logistics_1'],
    } as GameState
    const expected = Math.round(1000 * CONFIG.skills.effects.logistics_1.maintenanceMultiplier)
    expect(getMaintenanceCost(state)).toBe(expected)
  })
})

describe('getNetworkCities', () => {
  it('returns cities from open and pending routes', () => {
    const routes = [
      makeRoute('a', 'b', { status: 'open' }),
      makeRoute('b', 'c', { status: 'pending' }),
      makeRoute('c', 'd', { status: 'closed' }),
    ]
    const cities = getNetworkCities(routes)
    expect(cities.has('a')).toBe(true)
    expect(cities.has('b')).toBe(true)
    expect(cities.has('c')).toBe(true)
    expect(cities.has('d')).toBe(false) // only on closed route
  })
})

describe('getActiveLegitCount', () => {
  it('counts only non-illicit, non-smuggle shipments', () => {
    const shipments = [
      makeShipment({ id: 's1', isIllicit: false, smuggleRunId: null }),
      makeShipment({ id: 's2', isIllicit: true, smuggleRunId: null }),
      makeShipment({ id: 's3', isIllicit: true, smuggleRunId: 'smg_1' }),
      makeShipment({ id: 's4', isIllicit: false, smuggleRunId: null }),
    ]
    expect(getActiveLegitCount(shipments)).toBe(2)
  })

  it('returns 0 for empty shipments', () => {
    expect(getActiveLegitCount([])).toBe(0)
  })
})

describe('canEstablishRoute', () => {
  it('rejects non-closed routes', () => {
    const route = makeRoute('a', 'b', { status: 'open' })
    const state = { routes: [route], reputation: 100 } as GameState
    const result = canEstablishRoute(route, state)
    expect(result.ok).toBe(false)
  })

  it('rejects routes not connected to network', () => {
    const route = makeRoute('x', 'y', { status: 'closed' })
    const state = {
      routes: [makeRoute('a', 'b'), route],
      reputation: 100,
    } as GameState
    const result = canEstablishRoute(route, state)
    expect(result.ok).toBe(false)
  })

  it('rejects routes above rep requirement', () => {
    const route = makeRoute('a', 'c', { status: 'closed', tier: 'international' })
    const state = {
      routes: [makeRoute('a', 'b'), route],
      reputation: 10, // below 35 requirement
    } as GameState
    const result = canEstablishRoute(route, state)
    expect(result.ok).toBe(false)
  })

  it('accepts valid route establishment', () => {
    const route = makeRoute('a', 'c', { status: 'closed' })
    const state = {
      routes: [makeRoute('a', 'b'), route],
      reputation: 50,
    } as GameState
    const result = canEstablishRoute(route, state)
    expect(result.ok).toBe(true)
  })
})
