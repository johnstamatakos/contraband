import type { Route, VehicleType } from './gameState'

/**
 * Build an adjacency list from open routes.
 * Each edge is bidirectional (origin ↔ destination).
 */
function buildAdjacency(routes: Route[]): Map<string, { cityId: string; routeId: string }[]> {
  const adj = new Map<string, { cityId: string; routeId: string }[]>()
  for (const r of routes) {
    if (r.status !== 'open') continue
    if (!adj.has(r.origin)) adj.set(r.origin, [])
    if (!adj.has(r.destination)) adj.set(r.destination, [])
    adj.get(r.origin)!.push({ cityId: r.destination, routeId: r.id })
    adj.get(r.destination)!.push({ cityId: r.origin, routeId: r.id })
  }
  return adj
}

/**
 * BFS shortest path from `from` to `to` through open routes.
 * Returns the ordered list of city IDs including both endpoints, or null if unreachable.
 */
export function findShortestPath(
  from: string,
  to: string,
  routes: Route[],
): string[] | null {
  if (from === to) return [from]

  const adj = buildAdjacency(routes)
  const visited = new Set<string>([from])
  const parent = new Map<string, string>()
  const queue = [from]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const neighbor of adj.get(current) ?? []) {
      if (visited.has(neighbor.cityId)) continue
      visited.add(neighbor.cityId)
      parent.set(neighbor.cityId, current)

      if (neighbor.cityId === to) {
        // Reconstruct path
        const path: string[] = [to]
        let node = to
        while (parent.has(node)) {
          node = parent.get(node)!
          path.unshift(node)
        }
        return path
      }

      queue.push(neighbor.cityId)
    }
  }

  return null
}

/**
 * Find all paths from `from` to `to` through open routes, up to `maxHops` hops.
 * Returns an array of city ID lists (each including both endpoints).
 * Paths are returned shortest-first.
 */
export function findAllPaths(
  from: string,
  to: string,
  routes: Route[],
  maxHops = 6,
): string[][] {
  if (from === to) return [[from]]

  const adj = buildAdjacency(routes)
  const results: string[][] = []

  // DFS with visited tracking
  function dfs(current: string, path: string[], visited: Set<string>) {
    if (path.length - 1 >= maxHops) return
    for (const neighbor of adj.get(current) ?? []) {
      if (visited.has(neighbor.cityId)) continue
      const newPath = [...path, neighbor.cityId]

      if (neighbor.cityId === to) {
        results.push(newPath)
        continue
      }

      visited.add(neighbor.cityId)
      dfs(neighbor.cityId, newPath, visited)
      visited.delete(neighbor.cityId)
    }
  }

  const visited = new Set<string>([from])
  dfs(from, [from], visited)

  // Sort shortest first
  results.sort((a, b) => a.length - b.length)
  return results
}

/**
 * Find the route ID connecting two adjacent cities.
 * Returns the Route or null if no open route connects them.
 */
export function findRouteBetween(
  cityA: string,
  cityB: string,
  routes: Route[],
): Route | null {
  return routes.find(r =>
    r.status === 'open' &&
    ((r.origin === cityA && r.destination === cityB) ||
     (r.origin === cityB && r.destination === cityA)),
  ) ?? null
}

/**
 * Check if a vehicle type can traverse every hop in a path.
 * Returns true if the vehicle type is in `allowedVehicles` for every route segment.
 */
export function canVehicleTraversePath(
  vehicleType: VehicleType,
  path: string[],
  routes: Route[],
): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    const route = findRouteBetween(path[i]!, path[i + 1]!, routes)
    if (!route) return false
    if (!route.allowedVehicles.includes(vehicleType)) return false
  }
  return true
}
