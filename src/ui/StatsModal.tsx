import { useGameStore } from '../store/gameStore'
import { CONFIG } from '../engine/config'
import { getNetWorth } from '../engine/gameState'

interface StatsModalProps {
  onClose: () => void
}

function StatRow({ label, value, color = 'text-white' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex justify-between text-xs font-mono py-1 border-b border-gray-800/50">
      <span className="text-gray-500">{label}</span>
      <span className={color}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  )
}

export function StatsModal({ onClose }: StatsModalProps) {
  const { gameState } = useGameStore()
  const stats = gameState.lifetimeStats
  const nw = getNetWorth(gameState)
  const weeksPlayed = gameState.turn - 1
  const daysPlayed = weeksPlayed * 7

  // Most traded commodity (illicit)
  const topCommodity = Object.entries(stats.totalCommoditiesSmuggled)
    .sort((a, b) => b[1] - a[1])[0]
  const topCommodityDef = topCommodity
    ? CONFIG.smuggling.commodities[topCommodity[0] as keyof typeof CONFIG.smuggling.commodities]
    : null

  // Profit per week
  const profitPerWeek = weeksPlayed > 0
    ? Math.round((gameState.cash - CONFIG.start.cash) / weeksPlayed)
    : 0

  // Success rate
  const totalSmuggleAttempts = stats.smuggleRunsCompleted + stats.smuggleRunsBusted
  const successRate = totalSmuggleAttempts > 0
    ? Math.round((stats.smuggleRunsCompleted / totalSmuggleAttempts) * 100)
    : 0

  // Open routes count
  const openRoutes = gameState.routes.filter(r => r.status === 'open').length

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[480px] max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="font-mono font-bold text-white text-lg">Operation Stats</div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-lg font-mono">✕</button>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* Time & Status */}
          <div>
            <div className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider mb-2">Overview</div>
            <StatRow label="Time played" value={`${weeksPlayed} week${weeksPlayed !== 1 ? 's' : ''} (${daysPlayed} days)`} />
            <StatRow label="Current cash" value={`$${gameState.cash.toLocaleString()}`} color="text-emerald-400" />
            <StatRow label="Net worth" value={`$${nw.toLocaleString()}`} color="text-yellow-400" />
            <StatRow label="Reputation" value={`${gameState.reputation} / 100`} color="text-blue-400" />
            <StatRow label="Peak cash" value={`$${stats.peakCash.toLocaleString()}`} color="text-emerald-600" />
            <StatRow label="Peak reputation" value={stats.peakReputation} color="text-blue-600" />
          </div>

          {/* Financial */}
          <div>
            <div className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider mb-2">Finances</div>
            <StatRow label="Total money earned" value={`$${stats.totalMoneyEarned.toLocaleString()}`} color="text-emerald-400" />
            <StatRow label="Total money spent" value={`$${stats.totalMoneySpent.toLocaleString()}`} color="text-red-400" />
            <StatRow label="Net profit" value={`$${(stats.totalMoneyEarned - stats.totalMoneySpent).toLocaleString()}`} color={stats.totalMoneyEarned - stats.totalMoneySpent >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <StatRow label="Avg profit/week" value={`$${profitPerWeek.toLocaleString()}`} color={profitPerWeek >= 0 ? 'text-emerald-600' : 'text-red-600'} />
          </div>

          {/* Smuggling */}
          <div>
            <div className="text-xs font-mono font-semibold text-amber-500 uppercase tracking-wider mb-2">Smuggling</div>
            <StatRow label="Runs completed" value={stats.smuggleRunsCompleted} color="text-amber-400" />
            <StatRow label="Runs busted" value={stats.smuggleRunsBusted} color="text-red-400" />
            <StatRow label="Success rate" value={totalSmuggleAttempts > 0 ? `${successRate}%` : '—'} color={successRate >= 70 ? 'text-green-400' : 'text-orange-400'} />
            <StatRow label="Largest smuggle payout" value={stats.largestSmugglePayout > 0 ? `$${stats.largestSmugglePayout.toLocaleString()}` : '—'} color="text-amber-400" />
            <StatRow label="Close calls (30%+ risk)" value={stats.closeCalls} color="text-orange-400" />
            {topCommodityDef && topCommodity && (
              <StatRow label="Most smuggled" value={`${topCommodityDef.icon} ${topCommodityDef.displayName} (${topCommodity[1]} units)`} color="text-amber-300" />
            )}
          </div>

          {/* Legit Operations */}
          <div>
            <div className="text-xs font-mono font-semibold text-blue-400 uppercase tracking-wider mb-2">Supply Operations</div>
            <StatRow label="Legit deliveries" value={stats.legitDeliveriesCompleted} />
            <StatRow label="Largest contract payout" value={stats.largestContractPayout > 0 ? `$${stats.largestContractPayout.toLocaleString()}` : '—'} color="text-emerald-400" />
            <StatRow label="Total legit cargo delivered" value={stats.totalLegitCargoDelivered} />
          </div>

          {/* Fleet & Network */}
          <div>
            <div className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">Fleet & Network</div>
            <StatRow label="Current fleet" value={`${gameState.fleet.length} vehicle${gameState.fleet.length !== 1 ? 's' : ''}`} />
            <StatRow label="Peak fleet size" value={stats.largestFleetSize} />
            <StatRow label="Vehicles purchased" value={stats.vehiclesPurchased} />
            <StatRow label="Vehicles lost" value={stats.vehiclesLost} color={stats.vehiclesLost > 0 ? 'text-red-400' : 'text-white'} />
            <StatRow label="Routes established" value={stats.routesEstablished} />
            <StatRow label="Routes open" value={openRoutes} />
            <StatRow label="Skills unlocked" value={`${stats.skillsUnlocked} / 9`} />
          </div>

          {/* Trouble */}
          <div>
            <div className="text-xs font-mono font-semibold text-red-400 uppercase tracking-wider mb-2">Trouble</div>
            <StatRow label="Times busted" value={stats.timesBusted} color={stats.timesBusted > 0 ? 'text-red-400' : 'text-white'} />
            <StatRow label="Times sabotaged" value={stats.timesSabotaged} color={stats.timesSabotaged > 0 ? 'text-orange-400' : 'text-white'} />
            <StatRow label="Global heat" value={`${gameState.globalHeat} / 100`} color={gameState.globalHeat >= 50 ? 'text-red-400' : 'text-orange-400'} />
          </div>

        </div>

        <div className="px-5 py-3 border-t border-gray-800">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm font-mono font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
