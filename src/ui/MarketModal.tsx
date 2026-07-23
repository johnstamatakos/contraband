import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { CONFIG } from '../engine/config'

// ── Mini price-index line chart ───────────────────────────────────────────────

function PriceChart({
  history,
  basePrice,
  currentIdx,
}: {
  history: number[]
  basePrice: number
  currentIdx: number
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const W = 320, H = 72
  const padL = 4, padR = 4, padT = 8, padB = 8
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  if (history.length < 2) {
    return (
      <div className="flex items-center justify-center font-mono text-xs text-gray-700 italic"
           style={{ height: H }}>
        Not enough data — check back next week.
      </div>
    )
  }

  const weeks = history
  const n = weeks.length
  const allVals = [...weeks, 1.0]
  const minVal = Math.min(...allVals) - 0.05
  const maxVal = Math.max(...allVals) + 0.05
  const range = maxVal - minVal || 0.01

  const baselineY = padT + ((maxVal - 1.0) / range) * chartH
  const getX = (i: number) => padL + (i / (n - 1)) * chartW
  const getY = (v: number) => padT + ((maxVal - v) / range) * chartH

  const linePath = `M ${weeks.map((v, i) => `${getX(i).toFixed(1)},${getY(v).toFixed(1)}`).join(' L ')}`
  const areaPath =
    `M ${getX(0).toFixed(1)},${baselineY.toFixed(1)} ` +
    `L ${weeks.map((v, i) => `${getX(i).toFixed(1)},${getY(v).toFixed(1)}`).join(' L ')} ` +
    `L ${getX(n - 1).toFixed(1)},${baselineY.toFixed(1)} Z`

  const isAbove = currentIdx >= 1.0
  const lineCol  = isAbove ? '#34d399' : '#f87171'
  const fillCol  = isAbove ? '#34d399' : '#f87171'

  const hv = hoveredIdx !== null ? weeks[hoveredIdx]! : null

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: H, display: 'block' }}
      onMouseLeave={() => setHoveredIdx(null)}
    >
      {/* Baseline at index 1.0 */}
      <line x1={padL} y1={baselineY} x2={W - padR} y2={baselineY}
        stroke="#374151" strokeWidth="0.8" strokeDasharray="3,2" />

      {/* Area fill */}
      <path d={areaPath} fill={fillCol} opacity="0.12" />

      {/* Price line */}
      <path d={linePath} fill="none" stroke={lineCol} strokeWidth="1.5" strokeLinejoin="round" />

      {/* Week dots (invisible hit zones + visible dots) */}
      {weeks.map((v, i) => (
        <g key={i}>
          {/* Large transparent hit zone */}
          <circle cx={getX(i)} cy={getY(v)} r="8"
            fill="transparent"
            onMouseEnter={() => setHoveredIdx(i)} />
          {/* Visible dot */}
          <circle cx={getX(i)} cy={getY(v)} r={hoveredIdx === i ? 3.5 : 2}
            fill={lineCol}
            style={{ pointerEvents: 'none' }} />
        </g>
      ))}

      {/* Hover crosshair + tooltip */}
      {hoveredIdx !== null && hv !== null && (() => {
        const x = getX(hoveredIdx)
        const y = getY(hv)
        const buyPx = Math.round(basePrice * hv)
        const pct = (hv - 1.0) * 100
        const label = `$${buyPx}  ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`
        const tipW = 80
        const tipX = hoveredIdx > n * 0.65 ? x - tipW - 4 : x + 6
        const tipY = y - 18
        return (
          <>
            <line x1={x} y1={padT} x2={x} y2={H - padB}
              stroke="#4b5563" strokeWidth="0.75" strokeDasharray="2,2"
              style={{ pointerEvents: 'none' }} />
            <rect x={tipX} y={tipY} width={tipW} height={16} rx="2"
              fill="#030712" stroke="#374151" strokeWidth="0.5"
              style={{ pointerEvents: 'none' }} />
            <text x={tipX + 4} y={tipY + 11}
              fontSize="9" fill={lineCol} fontFamily="ui-monospace,monospace"
              style={{ pointerEvents: 'none' }}>
              {label}
            </text>
          </>
        )
      })()}
    </svg>
  )
}

// ── Commodity card ────────────────────────────────────────────────────────────

function CommodityCard({
  commodityKey,
  def,
  priceData,
  history,
}: {
  commodityKey: string
  def: { displayName: string; icon: string; buyPrice: number }
  priceData: { index: number; trend: number }
  history: number[]
}) {
  const idx = priceData.index
  const isAbove = idx >= 1.0
  const pct = (idx - 1.0) * 100
  const currentBuy = Math.round(def.buyPrice * idx)
  const prevIdx = history.length >= 2 ? history[history.length - 2]! : idx
  const weekDelta = ((idx - prevIdx) / Math.max(prevIdx, 0.01)) * 100
  const trendUp = priceData.trend > 0.005
  const trendDown = priceData.trend < -0.005

  const priceColor  = isAbove ? 'text-emerald-400' : 'text-red-400'
  const pctColor    = isAbove ? 'text-emerald-500' : 'text-red-500'
  const weekColor   = weekDelta >= 0 ? 'text-emerald-500' : 'text-red-400'
  const arrow       = trendUp ? '▲' : trendDown ? '▼' : '—'
  const arrowColor  = trendUp ? 'text-emerald-500' : trendDown ? 'text-red-400' : 'text-gray-600'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-2">
      {/* Top row: icon + name + price */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">{def.icon}</span>
          <div>
            <div className="text-white font-mono text-sm font-semibold leading-tight">
              {def.displayName}
            </div>
            <div className="text-gray-600 text-xs font-mono">
              Base ${def.buyPrice}/unit
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className={`text-xl font-bold font-mono ${priceColor}`}>
            ${currentBuy}
          </div>
          <div className={`text-xs font-mono font-semibold ${pctColor}`}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Stats row: week-over-week + trend direction */}
      <div className="flex items-center gap-3 text-xs font-mono">
        <span className="text-gray-600">1W:</span>
        <span className={weekColor}>
          {weekDelta >= 0 ? '+' : ''}{weekDelta.toFixed(1)}%
        </span>
        <span className="text-gray-700">·</span>
        <span className="text-gray-600">Trend:</span>
        <span className={arrowColor}>{arrow}</span>
        <span className={arrowColor + ' opacity-70'}>
          {priceData.trend > 0.005
            ? 'Rising'
            : priceData.trend < -0.005
            ? 'Falling'
            : 'Flat'}
        </span>
      </div>

      {/* Price index range indicator */}
      <div className="flex items-center gap-1.5">
        <span className="text-gray-700 text-[10px] font-mono w-12 text-right">
          {CONFIG.market.priceIndexMin.toFixed(0)}×
        </span>
        <div className="flex-1 h-1 bg-gray-800 rounded-full relative">
          <div
            className={`absolute top-0 h-full rounded-full ${isAbove ? 'bg-emerald-500' : 'bg-red-500'}`}
            style={{
              left: 0,
              width: `${((idx - CONFIG.market.priceIndexMin) / (CONFIG.market.priceIndexMax - CONFIG.market.priceIndexMin)) * 100}%`,
            }}
          />
          {/* Baseline tick */}
          <div
            className="absolute top-0 h-full w-px bg-gray-500"
            style={{
              left: `${((1.0 - CONFIG.market.priceIndexMin) / (CONFIG.market.priceIndexMax - CONFIG.market.priceIndexMin)) * 100}%`,
            }}
          />
        </div>
        <span className="text-gray-700 text-[10px] font-mono w-10">
          {CONFIG.market.priceIndexMax.toFixed(0)}×
        </span>
      </div>

      {/* Mini chart */}
      <PriceChart history={history} basePrice={def.buyPrice} currentIdx={idx} />
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function MarketModal({ onClose }: { onClose: () => void }) {
  const { gameState } = useGameStore()
  const { commodityPrices, commodityPriceHistory } = gameState

  const commodities = Object.entries(CONFIG.smuggling.commodities)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-6 px-4 bg-black/70"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-950 border border-gray-700 rounded-lg shadow-2xl w-full max-w-4xl flex flex-col max-h-[calc(100vh-5rem)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div>
            <div className="text-white font-mono font-bold text-sm uppercase tracking-widest">
              Commodity Markets
            </div>
            <div className="text-gray-600 text-[11px] font-mono mt-0.5">
              Prices fluctuate weekly · green = above base · red = below base · hover chart for weekly breakdown
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-300 font-mono text-xs px-2 py-1 border border-gray-800 hover:border-gray-600 rounded transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Cards grid */}
        <div className="overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-4">
            {commodities.map(([key, def]) => {
              const priceData = commodityPrices?.[key] ?? { index: 1.0, trend: 0.0 }
              const history   = commodityPriceHistory?.[key] ?? []
              return (
                <CommodityCard
                  key={key}
                  commodityKey={key}
                  def={def}
                  priceData={priceData}
                  history={history}
                />
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
