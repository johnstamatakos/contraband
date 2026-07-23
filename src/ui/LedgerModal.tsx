import { useGameStore } from '../store/gameStore'
import { getCityName } from '../data/cities'
import { CONFIG } from '../engine/config'

export function LedgerModal({ onClose }: { onClose: () => void }) {
  const { gameState } = useGameStore()

  const finished = [...gameState.smuggleRuns]
    .filter(r => r.status === 'completed' || r.status === 'busted')
    .sort((a, b) => (b.completedAtTurn ?? 0) - (a.completedAtTurn ?? 0))

  const delivered = finished.filter(r => r.status === 'completed')
  const busted    = finished.filter(r => r.status === 'busted')

  const netProfit = delivered.reduce((sum, r) => {
    const rev  = r.deliveredPayout ?? 0
    const cost = r.volume * r.buyPricePerUnit
    return sum + (rev - cost)
  }, 0) - busted.reduce((sum, r) => sum + r.volume * r.buyPricePerUnit, 0)

  const totalRep = finished.reduce((sum, r) => sum + (r.actualRepGained ?? 0), 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-6 px-4 bg-black/70"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-950 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl flex flex-col max-h-[calc(100vh-5rem)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div className="text-white font-mono font-bold text-sm uppercase tracking-widest">
            Ops Ledger
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-300 font-mono text-xs px-2 py-1 border border-gray-800 hover:border-gray-600 rounded transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Summary strip */}
        <div className="flex items-center gap-5 px-6 py-3 border-b border-gray-800/60 shrink-0 text-xs font-mono">
          <span>
            <span className="text-gray-600">Delivered </span>
            <span className="text-emerald-400 font-semibold">{delivered.length}</span>
          </span>
          <span>
            <span className="text-gray-600">Busted </span>
            <span className="text-red-400 font-semibold">{busted.length}</span>
          </span>
          <span>
            <span className="text-gray-600">Net </span>
            <span className={`font-semibold ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString()}
            </span>
          </span>
          <span>
            <span className="text-gray-600">Rep </span>
            <span className="text-blue-400 font-semibold">+{totalRep}</span>
          </span>
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1 px-6 py-2">
          {finished.length === 0 ? (
            <p className="text-xs font-mono text-gray-700 italic py-6 text-center">
              No completed runs yet.
            </p>
          ) : (
            <div className="space-y-0">
              {finished.map(run => {
                const def = CONFIG.smuggling.commodities[run.commodityKey as keyof typeof CONFIG.smuggling.commodities]
                const isBust = run.status === 'busted'
                const cost = run.volume * run.buyPricePerUnit
                const rev  = run.deliveredPayout ?? 0
                const profit = isBust ? -cost : rev - cost
                const hops = run.hops.length

                return (
                  <div key={run.id} className="py-2 border-b border-gray-800/50">
                    {/* Line 1: status + commodity + route + volume */}
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className={isBust ? 'text-red-500' : 'text-emerald-500'}>
                        {isBust ? '✗' : '✓'}
                      </span>
                      <span className="text-gray-300">
                        {def?.icon} {def?.displayName ?? run.commodityKey}
                      </span>
                      <span className="text-gray-600">·</span>
                      <span className="text-gray-400">
                        {getCityName(run.sourceCity)} → {getCityName(run.destinationCity)}
                        {hops > 1 && <span className="text-gray-700 ml-1">({hops} hops)</span>}
                      </span>
                      <span className="text-gray-600">·</span>
                      <span className="text-gray-500">{run.volume}u</span>
                    </div>

                    {/* Line 2: economics */}
                    <div className="flex items-center gap-2 text-[11px] font-mono mt-0.5 pl-4">
                      <span className="text-gray-600">Cost</span>
                      <span className="text-gray-500">−${cost.toLocaleString()}</span>
                      <span className="text-gray-700">·</span>

                      {isBust ? (
                        <span className="text-red-500 font-semibold">BUSTED</span>
                      ) : (
                        <>
                          <span className="text-gray-600">Revenue</span>
                          <span className="text-gray-400">+${rev.toLocaleString()}</span>
                          <span className="text-gray-700">·</span>
                        </>
                      )}

                      <span className={`font-semibold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {profit >= 0 ? '+' : ''}${profit.toLocaleString()}
                      </span>

                      {run.actualRepGained != null && run.actualRepGained > 0 && (
                        <>
                          <span className="text-gray-700">·</span>
                          <span className="text-blue-400">+{run.actualRepGained} rep</span>
                        </>
                      )}

                      <span className="text-gray-700">·</span>
                      <span className="text-gray-700">W{run.completedAtTurn}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
