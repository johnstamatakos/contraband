import { useGameStore } from '../store/gameStore'
import type { DeliveryRecord } from '../engine/gameState'
import { formatWeekDate } from '../utils/gameTime'

function DeliveryRow({ d }: { d: DeliveryRecord }) {
  if (d.wasBust) {
    return (
      <div className="flex items-center justify-between text-xs font-mono py-1 border-b border-gray-800/50">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-red-500 shrink-0">✗</span>
          <span className="text-gray-400 truncate">{d.origin} → {d.destination}</span>
          <span className="text-gray-600 shrink-0">{d.cargoType}</span>
        </div>
        <span className="text-red-400 shrink-0 ml-2">BUSTED</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between text-xs font-mono py-1 border-b border-gray-800/50">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={d.isIllicit ? 'text-red-400 shrink-0' : 'text-emerald-400 shrink-0'}>✓</span>
        <span className="text-gray-300 truncate">{d.origin} → {d.destination}</span>
        <span className="text-gray-600 shrink-0">{d.cargoType}</span>
      </div>
      <span className="text-emerald-400 shrink-0 ml-2">+${d.payout.toLocaleString()}</span>
    </div>
  )
}

export function WeeklyReport() {
  const summary = useGameStore(s => s.gameState.lastWeeklySummary)
  const { clearWeeklySummary } = useGameStore()

  if (!summary) return null

  const handleDismiss = () => {
    clearWeeklySummary()
  }

  const repSign = summary.repChange >= 0 ? '+' : ''
  const heatSign = summary.heatChange >= 0 ? '+' : ''
  const netSign = summary.netCashChange >= 0 ? '+' : ''

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-2 pointer-events-none">
        <div className="text-xs font-mono uppercase tracking-widest text-amber-400 bg-gray-900/80 px-3 py-1 rounded">
          ⏸ Paused
        </div>
      </div>

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-5 w-96 max-h-[80vh] flex flex-col">

          {/* Header */}
          <div className="text-xs font-mono uppercase tracking-widest text-gray-500 mb-3 border-b border-gray-800 pb-2 shrink-0">
            Week {summary.weekNumber} report
            <span className="ml-2 text-gray-700 normal-case tracking-normal">
              {formatWeekDate(summary.weekNumber)}
            </span>
          </div>

          {/* Deliveries list */}
          {summary.completedDeliveries.length > 0 ? (
            <div className="mb-3 overflow-y-auto shrink-0 max-h-48">
              <div className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-1">
                Deliveries
              </div>
              <div>
                {summary.completedDeliveries.map((d, i) => (
                  <DeliveryRow key={i} d={d} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs font-mono text-gray-700 mb-3 italic">No deliveries this week.</div>
          )}

          {/* Cash breakdown */}
          <div className="space-y-1 mb-3 shrink-0">
            {summary.fixedCosts > 0 && (
              <div className="flex justify-between text-xs font-mono">
                <span className="text-gray-500">Fixed costs</span>
                <span className="text-red-400">-${summary.fixedCosts.toLocaleString()}</span>
              </div>
            )}
            {summary.deliveryIncome > 0 && (
              <div className="flex justify-between text-xs font-mono">
                <span className="text-gray-500">Delivery income</span>
                <span className="text-emerald-400">+${summary.deliveryIncome.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-xs font-mono border-t border-gray-800 pt-1">
              <span className="text-gray-400 font-semibold">Net cash</span>
              <span className={`font-semibold ${summary.netCashChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {netSign}${Math.abs(summary.netCashChange).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Rep / Heat / Busts row */}
          <div className="flex gap-4 mb-3 text-xs font-mono shrink-0">
            {summary.repChange !== 0 && (
              <div>
                <span className="text-gray-500">Rep </span>
                <span className={summary.repChange > 0 ? 'text-blue-400' : 'text-red-400'}>
                  {repSign}{summary.repChange}
                </span>
              </div>
            )}
            {summary.heatChange !== 0 && (
              <div>
                <span className="text-gray-500">Heat </span>
                <span className={summary.heatChange > 0 ? 'text-orange-400' : 'text-gray-400'}>
                  {heatSign}{summary.heatChange}
                </span>
              </div>
            )}
            {summary.busts > 0 && (
              <div className="text-red-400">
                {summary.busts} bust{summary.busts > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Routes opened */}
          {summary.routesOpened.length > 0 && (
            <div className="mb-3 space-y-0.5 shrink-0">
              {summary.routesOpened.map(r => (
                <div key={r} className="text-xs font-mono text-amber-400">
                  ↗ Route opened: {r}
                </div>
              ))}
            </div>
          )}

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="w-full py-2 text-xs font-mono bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors mt-1 shrink-0"
          >
            Resume
          </button>
        </div>
      </div>
    </>
  )
}
