import { describe, it, expect } from 'vitest'
import { findShortestPath, findAllPaths, findRouteBetween, canVehicleTraversePath } from '../pathfinding'
import type { Route } from '../gameState'

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

const testRoutes: Route[] = [
  makeRoute('a', 'b'),
  makeRoute('b', 'c'),
  makeRoute('a', 'c'), // direct shortcut
  makeRoute('c', 'd'),
  makeRoute('d', 'e'),
]

describe('findShortestPath', () => {
  it('returns direct path for adjacent cities', () => {
    const path = findShortestPath('a', 'b', testRoutes)
    expect(path).toEqual(['a', 'b'])
  })

  it('finds shortest when multiple paths exist', () => {
    // a→c (direct) is shorter than a→b→c
    const path = findShortestPath('a', 'c', testRoutes)
    expect(path).toEqual(['a', 'c'])
  })

  it('finds multi-hop path', () => {
    const path = findShortestPath('a', 'e', testRoutes)
    expect(path).not.toBeNull()
    expect(path![0]).toBe('a')
    expect(path![path!.length - 1]).toBe('e')
  })

  it('returns null for unreachable cities', () => {
    const path = findShortestPath('a', 'z', testRoutes)
    expect(path).toBeNull()
  })

  it('returns single-element for same city', () => {
    const path = findShortestPath('a', 'a', testRoutes)
    expect(path).toEqual(['a'])
  })

  it('treats routes as bidirectional', () => {
    const path = findShortestPath('b', 'a', testRoutes)
    expect(path).toEqual(['b', 'a'])
  })

  it('ignores closed routes', () => {
    const routes = [
      makeRoute('a', 'b'),
      makeRoute('b', 'c', { status: 'closed' }),
    ]
    const path = findShortestPath('a', 'c', routes)
    expect(path).toBeNull()
  })
})

describe('findAllPaths', () => {
  it('returns all paths sorted shortest first', () => {
    const paths = findAllPaths('a', 'c', testRoutes)
    expect(paths.length).toBeGreaterThanOrEqual(2) // direct + via b
    expect(paths[0]).toEqual(['a', 'c']) // shortest
    expect(paths[0]!.length).toBeLessThanOrEqual(paths[1]!.length)
  })

  it('respects maxHops', () => {
    const paths = findAllPaths('a', 'e', testRoutes, 2)
    // a→c→d→e = 3 hops, over limit of 2
    // a→b→c→d→e = 4 hops, over limit
    // Only path within 2 hops would need a direct route, which doesn't exist
    for (const p of paths) {
      expect(p.length - 1).toBeLessThanOrEqual(2)
    }
  })

  it('returns empty for unreachable', () => {
    const paths = findAllPaths('a', 'z', testRoutes)
    expect(paths).toEqual([])
  })
})

describe('findRouteBetween', () => {
  it('finds route connecting two cities', () => {
    const route = findRouteBetween('a', 'b', testRoutes)
    expect(route).not.toBeNull()
    expect(route!.id).toBe('route_a_b')
  })

  it('finds route in reverse direction', () => {
    const route = findRouteBetween('b', 'a', testRoutes)
    expect(route).not.toBeNull()
    expect(route!.id).toBe('route_a_b')
  })

  it('returns null for non-adjacent cities', () => {
    const route = findRouteBetween('a', 'd', testRoutes)
    expect(route).toBeNull()
  })
})

describe('canVehicleTraversePath', () => {
  it('returns true when vehicle type allowed on all segments', () => {
    expect(canVehicleTraversePath('truck', ['a', 'b', 'c'], testRoutes)).toBe(true)
  })

  it('returns false when vehicle type not allowed on a segment', () => {
    const routes = [
      makeRoute('a', 'b', { allowedVehicles: ['truck', 'plane'] }),
      makeRoute('b', 'c', { allowedVehicles: ['ship'] }), // no truck
    ]
    expect(canVehicleTraversePath('truck', ['a', 'b', 'c'], routes)).toBe(false)
  })

  it('returns true for single-city path', () => {
    expect(canVehicleTraversePath('truck', ['a'], testRoutes)).toBe(true)
  })
})
