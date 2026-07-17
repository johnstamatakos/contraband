import type { GameState, LifetimeStats } from '../engine/gameState'

export function bumpStats(stats: LifetimeStats, delta: Partial<LifetimeStats>): LifetimeStats {
  const next = { ...stats }
  for (const [k, v] of Object.entries(delta)) {
    if (typeof v === 'number' && typeof (next as Record<string, unknown>)[k] === 'number') {
      (next as unknown as Record<string, number>)[k] = ((next as unknown as Record<string, number>)[k] ?? 0) + v
    }
  }
  return next
}

export function bumpCommoditySmuggled(stats: LifetimeStats, key: string, qty: number): LifetimeStats {
  const totals = { ...stats.totalCommoditiesSmuggled }
  totals[key] = (totals[key] ?? 0) + qty
  return { ...stats, totalCommoditiesSmuggled: totals }
}

export function peakStats(state: GameState): LifetimeStats {
  return {
    ...state.lifetimeStats,
    peakCash: Math.max(state.lifetimeStats.peakCash, state.cash),
    peakReputation: Math.max(state.lifetimeStats.peakReputation, state.reputation),
    largestFleetSize: Math.max(state.lifetimeStats.largestFleetSize, state.fleet.filter(v => !v.isImpounded).length),
  }
}
