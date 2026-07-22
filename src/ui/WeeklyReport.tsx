import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { DeliveryRecord, CrackdownRaidResult } from '../engine/gameState'
import { getCityName } from '../data/cities'
import { formatWeekDate } from '../utils/gameTime'
import { DetectionBadge } from './DetectionBadge'

// ── P&L bar chart ─────────────────────────────────────────────────────────────

function fmtK(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  return abs >= 1000 ? `${sign}$${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k` : `${sign}$${abs}`
}

function ProfitChart({ history }: { history: number[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const weeks = history.slice(-8)

  if (weeks.length < 2) {
    return (
      <p className="text-xs font-mono text-gray-700 text-center py-4 italic">
        Not enough data — check back in a few weeks.
      </p>
    )
  }

  const W = 440, H = 160
  const padL = 6, padR = 6, padT = 30, padB = 22
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const n      = weeks.length
  const gap    = 6
  const barW   = Math.floor((chartW - gap * (n - 1)) / n)

  const maxAbs  = Math.max(...weeks.map(Math.abs), 1)
  const hasNeg  = weeks.some(v => v < 0)
  const zeroY   = hasNeg ? padT + chartH / 2 : padT + chartH
  const maxBarH = (hasNeg ? chartH / 2 : chartH) - 4

  const getBarY = (v: number) => zeroY - (v / maxAbs) * maxBarH
  const getX    = (i: number) => padL + i * (barW + gap)
  const total   = weeks.reduce((a, b) => a + b, 0)

  // Hover tooltip (full value)
  const hIdx = hoveredIdx
  const hv   = hIdx !== null ? weeks[hIdx]! : 0
  const tooltipLabel = hIdx !== null
    ? `Wk ${history.length - weeks.length + hIdx + 1}: ${hv >= 0 ? '+' : ''}$${Math.abs(hv).toLocaleString()}`
    : ''
  const tooltipW = tooltipLabel.length * 5.4 + 12
  const tooltipX = hIdx !== null
    ? Math.min(Math.max(getX(hIdx) + barW / 2 - tooltipW / 2, padL), W - padR - tooltipW)
    : 0

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

        {/* Zero baseline */}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY}
          stroke="#4b5563" strokeWidth="1" strokeDasharray="3,3" />

        {/* Bars + labels */}
        {weeks.map((v, i) => {
          const x      = getX(i)
          const barY   = getBarY(v)
          const barTop = Math.min(barY, zeroY)
          const barH   = Math.max(Math.abs(zeroY - barY), 2)
          const isHov  = hoveredIdx === i
          const weekNum = history.length - weeks.length + i + 1

          const color  = v >= 0
            ? (isHov ? '#34d399' : '#10b981')
            : (isHov ? '#f87171' : '#ef4444')

          // Abbreviated value label above positive / below negative bars
          const valY = v >= 0 ? barTop - 5 : barTop + barH + 12

          return (
            <g key={i} onMouseEnter={() => setHoveredIdx(i)} style={{ cursor: 'default' }}>
              <rect x={x} y={barTop} width={barW} height={barH}
                fill={color} rx="2" opacity={isHov ? 1 : 0.78} />
              <text x={x + barW / 2} y={valY}
                textAnchor="middle" fontSize="8.5"
                fill={color} fontFamily="ui-monospace,monospace"
                fontWeight={isHov ? 'bold' : 'normal'}>
                {(v >= 0 ? '+' : '') + fmtK(v)}
              </text>
              <text x={x + barW / 2} y={H - 4}
                textAnchor="middle" fontSize="7.5"
                fill={isHov ? '#d1d5db' : '#6b7280'}
                fontFamily="ui-monospace,monospace">
                W{weekNum}
              </text>
            </g>
          )
        })}

        {/* Full-value tooltip on hover */}
        {hIdx !== null && (
          <>
            <rect x={tooltipX} y={4} width={tooltipW} height={15}
              rx="2" fill="#111827" stroke="#374151" strokeWidth="0.75" />
            <text x={tooltipX + tooltipW / 2} y={14.5}
              textAnchor="middle" fontSize="8" fill="#f9fafb"
              fontFamily="ui-monospace,monospace">
              {tooltipLabel}
            </text>
          </>
        )}
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
