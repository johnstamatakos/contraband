import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { DeliveryRecord, CrackdownRaidResult } from '../engine/gameState'
import { formatWeekDate } from '../utils/gameTime'
import { DetectionBadge } from './DetectionBadge'

// ── P&L line chart ────────────────────────────────────────────────────────────

function ProfitChart({ history }: { history: number[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const weeks = history.slice(-10)
  if (weeks.length < 2) {
    return (
      <p className="text-xs font-mono text-gray-700 text-center py-4 italic">
        Not enough data — check back in a few weeks.
      </p>
    )
  }

  const W = 440, H = 140
  const padL = 42, padR = 12, padT = 24, padB = 20
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const n = weeks.length

  const minVal = Math.min(...weeks, 0)
  const maxVal = Math.max(...weeks, 0)
  const range = maxVal - minVal || 1

  const zeroY = padT + ((maxVal) / range) * chartH

  const getX = (i: number) => padL + (i / (n - 1)) * chartW
  const getY = (v: number) => padT + ((maxVal - v) / range) * chartH

  const total = weeks.reduce((a, b) => a + b, 0)

  // Build SVG path
  const points = weeks.map((v, i) => `${getX(i).toFixed(1)},${getY(v).toFixed(1)}`)
  const linePath = `M ${points.join(' L ')}`

  // Area fill path (close back to zero line)
  const areaPoints = weeks.map((v, i) => `${getX(i).toFixed(1)},${getY(v).toFixed(1)}`).join(' L ')
  const areaPath = `M ${getX(0).toFixed(1)},${zeroY.toFixed(1)} L ${areaPoints} L ${getX(n-1).toFixed(1)},${zeroY.toFixed(1)} Z`

  const hIdx = hoveredIdx
  const hv = hIdx !== null ? weeks[hIdx]! : 0
  const weekNum = hIdx !== null ? history.length - weeks.length + hIdx + 1 : 0

  // Y axis labels
  const yLabels = []
  if (maxVal > 0) yLabels.push({ v: maxVal, y: getY(maxVal) })
  if (minVal < 0) yLabels.push({ v: minVal, y: getY(minVal) })
  yLabels.push({ v: 0, y: zeroY })

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-mono mb-2">
        <span className="text-gray-600 uppercase tracking-widest">P&amp;L — last {n} weeks</span>
        <span className={total >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          {total >= 0 ? '+' : ''}${total.toLocaleString()} total
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}
        onMouseLeave={() => setHoveredIdx(null)}>

        {/* Y axis labels */}
        {yLabels.map(({ v, y }) => (
          <text key={v} x={padL - 4} y={y + 3.5}
            textAnchor="end" fontSize="8" fill="#4b5563"
            fontFamily="ui-monospace,monospace">
            {v >= 1000 ? `$${(v/1000).toFixed(0)}k` : v <= -1000 ? `-$${(Math.abs(v)/1000).toFixed(0)}k` : `$${v}`}
          </text>
        ))}

        {/* Zero baseline */}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY}
          stroke="#374151" strokeWidth="1" strokeDasharray="3,3" />

        {/* Area fill */}
        <path d={areaPath} fill="#10b981" opacity="0.08" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinejoin="round" />

        {/* Data points */}
        {weeks.map((v, i) => {
          const x = getX(i)
          const y = getY(v)
          const isHov = hoveredIdx === i
          const wNum = history.length - weeks.length + i + 1
          return (
            <g key={i} onMouseEnter={() => setHoveredIdx(i)} style={{ cursor: 'default' }}>
              {/* Invisible hover target */}
              <rect x={x - 12} y={padT} width={24} height={chartH} fill="transparent" />
              {/* Vertical hover line */}
              {isHov && (
                <line x1={x} y1={padT} x2={x} y2={padT + chartH}
                  stroke="#374151" strokeWidth="1" strokeDasharray="2,2" />
              )}
              <circle cx={x} cy={y} r={isHov ? 5 : 3}
                fill={v >= 0 ? '#10b981' : '#ef4444'}
                stroke={isHov ? '#fff' : 'none'} strokeWidth="1.5" />
              {/* Week label on x axis */}
              <text x={x} y={H - 4}
                textAnchor="middle" fontSize="7.5"
                fill={isHov ? '#d1d5db' : '#4b5563'}
                fontFamily="ui-monospace,monospace">
                W{wNum}
              </text>
            </g>
          )
        })}

        {/* Hover tooltip */}
        {hIdx !== null && (() => {
          const x = getX(hIdx)
          const label = `Wk ${weekNum}: ${hv >= 0 ? '+' : ''}$${Math.abs(hv).toLocaleString()}`
          const tw = label.length * 7.2 + 16
          const tx = Math.min(Math.max(x - tw / 2, padL), W - padR - tw)
          return (
            <>
              <rect x={tx} y={4} width={tw} height={18}
                rx="3" fill="#1f2937" stroke="#374151" strokeWidth="0.75" />
              <text x={tx + tw / 2} y={16}
                textAnchor="middle" fontSize="11" fill="#f9fafb"
                fontFamily="ui-monospace,monospace" fontWeight="600">
                {label}
              </text>
            </>
          )
        })()}
      </svg>
    </div>
  )
}


function DeliveryRow({ d }: { d: DeliveryRecord }) {
  if (d.wasBust) {
    return (
      <div className="flex items-center justify-between text-xs font-mono py-1 border-b border-gray-800/50">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-red-500 shrink-0">✗</span>
          <span className="text-gray-400 truncate">{d.origin} → {d.destination}</span>
          <span className="text-gray-600 shrink-0">{d.cargoType}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {d.riskBreakdown && (
            <DetectionBadge breakdown={d.riskBreakdown} faded />
          )}
          <span className="text-red-400">BUSTED</span>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between text-xs font-mono py-1 border-b border-gray-800/50">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={d.isIllicit ? 'text-amber-400 shrink-0' : 'text-emerald-400 shrink-0'}>✓</span>
        <span className="text-gray-300 truncate">{d.origin} → {d.destination}</span>
        <span className="text-gray-600 shrink-0">{d.cargoType}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        {d.riskBreakdown && (
          <DetectionBadge breakdown={d.riskBreakdown} />
        )}
        <span className="text-emerald-400">+${d.payout.toLocaleString()}</span>
      </div>
    </div>
  )
}

export function WeeklyReport() {
  const summary = useGameStore(s => s.gameState.lastWeeklySummary)
  const profitHistory = useGameStore(s => s.gameState.profitHistory)
  const { clearWeeklySummary } = useGameStore()
  const [deliveriesOpen, setDeliveriesOpen] = useState(false)

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
        <div className="pointer-events-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-5 w-[560px] max-h-[92vh] flex flex-col">

          {/* Header */}
          <div className="text-xs font-mono uppercase tracking-widest text-gray-500 mb-3 border-b border-gray-800 pb-2 shrink-0">
            Week {summary.weekNumber} report
            <span className="ml-2 text-gray-700 normal-case tracking-normal">
              {formatWeekDate(summary.weekNumber)}
            </span>
          </div>

          {/* Crackdown alert — shown at top when a crackdown fired this week */}
          {summary.crackdown?.triggered && (
            <div className="mb-3 shrink-0 border border-red-800/60 rounded p-3 bg-red-950/30">
              <div className="text-xs font-mono font-bold text-red-400 uppercase tracking-wider mb-1.5">
                ⚡ Law Enforcement Crackdown
              </div>
              <div className="text-xs font-mono text-red-300 mb-1">
                All open routes +{2} heat.
              </div>
              {summary.crackdown.raidedCities.length > 0 ? (
                <div className="space-y-1.5 mt-1.5">
                  {summary.crackdown.raidedCities.map((raid: CrackdownRaidResult) => (
                    <div key={raid.cityId} className="text-xs font-mono">
                      <div className="text-red-300 font-semibold">{raid.cityName} warehouse raided</div>
                      <div className="text-gray-400 ml-2 space-y-0.5">
                        {Object.entries(raid.seized).map(([key, qty]) => (
                          <div key={key}>• {qty} units {key.replace(/_/g, ' ')} seized</div>
                        ))}
                        <div className="text-red-400">Fine: -${raid.fine.toLocaleString()}  Heat: +{raid.heatGain}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs font-mono text-gray-500 mt-1">No warehouses in your network were raided.</div>
              )}
            </div>
          )}

          {/* Deliveries list — collapsible */}
          <div className="mb-3 shrink-0">
            {summary.completedDeliveries.length > 0 ? (
              <>
                <button
                  onClick={() => setDeliveriesOpen(o => !o)}
                  className="w-full flex items-center justify-between text-xs font-mono text-gray-600 uppercase tracking-widest mb-1 hover:text-gray-400 transition-colors"
                >
                  <span>Deliveries <span className="text-gray-700 normal-case tracking-normal">({summary.completedDeliveries.length})</span></span>
                  <span>{deliveriesOpen ? '▴' : '▾'}</span>
                </button>
                {deliveriesOpen && (
                  <div className="overflow-y-auto max-h-64">
                    {summary.completedDeliveries.map((d, i) => (
                      <DeliveryRow key={i} d={d} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs font-mono text-gray-700 italic">No deliveries this week.</div>
            )}
          </div>

          {/* Cash breakdown */}
          <div className="space-y-1 mb-3 shrink-0">
            {summary.maintenanceCost > 0 && (
              <div className="flex justify-between text-xs font-mono">
                <span className="text-gray-500">Fleet maintenance</span>
                <span className="text-red-400">-${summary.maintenanceCost.toLocaleString()}</span>
              </div>
            )}
            {summary.fleetSurcharge > 0 && (
              <div className="flex justify-between text-xs font-mono">
                <span className="text-orange-500">Fleet overhead surcharge</span>
                <span className="text-orange-400">-${summary.fleetSurcharge.toLocaleString()}</span>
              </div>
            )}
            {summary.otherExpenses > 0 && (
              <div className="flex justify-between text-xs font-mono">
                <span className="text-gray-500">Other expenses</span>
                <span className="text-red-400">-${summary.otherExpenses.toLocaleString()}</span>
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
              <div className="relative group">
                <span className="text-gray-500">Rep </span>
                <span className={`${summary.repChange > 0 ? 'text-blue-400' : 'text-red-400'} border-b border-dashed border-gray-600 cursor-help`}>
                  {repSign}{summary.repChange}
                </span>
                {/* Hover tooltip */}
                {summary.repBreakdown && (
                  <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-10 bg-gray-900 border border-gray-700 rounded px-2.5 py-2 text-xs font-mono whitespace-nowrap shadow-xl">
                    {summary.repBreakdown.fromDeliveries !== 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-400">Deliveries</span>
                        <span className="text-blue-400">+{summary.repBreakdown.fromDeliveries}</span>
                      </div>
                    )}
                    {summary.repBreakdown.fromDecay !== 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-400">Inactivity</span>
                        <span className="text-orange-400">{summary.repBreakdown.fromDecay}</span>
                      </div>
                    )}
                    {(() => {
                      const bustLoss = summary.repChange - summary.repBreakdown.fromDeliveries - summary.repBreakdown.fromDecay
                      return bustLoss !== 0 ? (
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-400">Busts/events</span>
                          <span className="text-red-400">{bustLoss > 0 ? '+' : ''}{bustLoss}</span>
                        </div>
                      ) : null
                    })()}
                  </div>
                )}
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

          {/* P&L chart */}
          <div className="border-t border-gray-800 pt-3 mt-1 shrink-0">
            <ProfitChart history={profitHistory} />
          </div>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="w-full py-2 text-xs font-mono bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors mt-3 shrink-0"
          >
            Resume
          </button>
        </div>
      </div>
    </>
  )
}
