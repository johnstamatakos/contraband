import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { GameClock } from './GameClock'
import { CONFIG } from '../engine/config'
import { getCityName } from '../data/cities'
import { StatsModal } from './StatsModal'

// ── Commodity market ticker ───────────────────────────────────────────────────

const TICKER_SHORTS: Record<string, string> = {
  narcotics:              'NARC',
  counterfeit_electronics:'C-ELEC',
  smuggled_currency:      'SMGD-$',
  forged_documents:       'F-DOCS',
  black_market_pharma:    'BLK-RX',
  restricted_tech:        'R-TECH',
  contraband_chemicals:   'CHEM',
}

function MarketTicker({ prices }: { prices: Record<string, { index: number; trend: number }> }) {
  const commodities = Object.entries(CONFIG.smuggling.commodities)

  // Render all items with a unique key prefix so React is happy across copies
  function renderItems(prefix: string) {
    return commodities.map(([key, def]) => {
      const price = prices[key] ?? { index: 1.0, trend: 0.0 }
      const idx = price.index
      const pct = (idx - 1.0) * 100
      const pctLabel = (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%'
      const currentBuy = Math.round(def.buyPrice * idx)
      const isUp = price.trend > 0.005
      const isDown = price.trend < -0.005

      let color = 'text-gray-400'
      if (idx >= 1.50) color = 'text-emerald-400'
      else if (idx >= 1.20) color = 'text-emerald-600'
      else if (idx <= 0.65) color = 'text-amber-400'
      else if (idx <= 0.85) color = 'text-amber-600'

      const arrow = isUp ? '▲' : isDown ? '▼' : '—'
      const arrowColor = isUp ? 'text-emerald-500' : isDown ? 'text-red-500' : 'text-gray-600'
      const short = TICKER_SHORTS[key] ?? key.toUpperCase().slice(0, 6)

      return (
        <span key={`${prefix}_${key}`} className="inline-flex items-center gap-1.5 px-3">
          <span className="text-gray-600">{def.icon}</span>
          <span className="text-gray-500 font-semibold">{short}</span>
          <span className={color}>${currentBuy}</span>
          <span className={arrowColor + ' text-[10px]'}>{arrow}</span>
          <span className={color + ' opacity-70'}>{pctLabel}</span>
          <span className="text-gray-800 ml-1">·</span>
        </span>
      )
    })
  }

  // Each "block" repeats the 7 items 4× (~3600px), guaranteeing it's wider than any viewport.
  // We render 2 identical blocks so the -50% translateX loop point is always invisible.
  const block = (blockIdx: number) => [0, 1, 2, 3].map(r => renderItems(`b${blockIdx}r${r}`))

  return (
    <div className="border-t border-gray-800 bg-gray-950 overflow-hidden h-6 flex items-center relative select-none">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-6 z-10 pointer-events-none"
           style={{ background: 'linear-gradient(to right, #030712, transparent)' }} />
      <div className="absolute right-0 top-0 bottom-0 w-6 z-10 pointer-events-none"
           style={{ background: 'linear-gradient(to left, #030712, transparent)' }} />

      <div
        className="flex whitespace-nowrap text-[11px] font-mono"
        style={{ animation: 'ticker-scroll 60s linear infinite' }}
      >
        {block(0)}
        {block(1)}
      </div>
    </div>
  )
}

function Meter({
  label,
  value,
  max,
  color,
  format,
}: {
  label: string
  value: number
  max: number
  color: string
  format?: (v: number) => string
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const display = format ? format(value) : `${value}`
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex justify-between text-xs text-gray-400 font-mono">
        <span>{label}</span>
        <span className="text-white font-semibold">{display}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-700">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function InventoryStrip({
  commodities,
  perCity,
}: {
  commodities: [string, number][]
  perCity: Record<string, Record<string, number>>
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="w-px h-10 bg-gray-700" />
      <div className="flex items-center gap-4">
        {commodities.map(([key, total]) => {
          const def = CONFIG.smuggling.commodities[key as keyof typeof CONFIG.smuggling.commodities]
          if (!def) return null
          const cities = perCity[key] ?? {}

          return (
            <div
              key={key}
              className="relative flex items-center gap-1.5 cursor-default"
              onMouseEnter={e => {
                setHoveredKey(key)
                setTooltipPos({ x: e.clientX, y: e.clientY })
              }}
              onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => {
                setHoveredKey(null)
                setTooltipPos(null)
              }}
            >
              <span className="text-lg leading-none">{def.icon}</span>
              <span className="text-sm font-mono font-semibold text-amber-400">{total}</span>

              {/* Tooltip: per-city breakdown */}
              {hoveredKey === key && tooltipPos && (
                <div
                  className="fixed bg-gray-950 border border-gray-700 rounded p-2 text-xs font-mono min-w-[10rem] shadow-xl z-[9999] pointer-events-none"
                  style={{ left: tooltipPos.x - 50, top: tooltipPos.y + 20 }}
                >
                  <div className="text-gray-400 font-semibold mb-1">{def.displayName}</div>
                  {Object.entries(cities).map(([cityId, qty]) => (
                    <div key={cityId} className="flex justify-between gap-4">
                      <span className="text-gray-500">{getCityName(cityId)}</span>
                      <span className="text-amber-400">{qty}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface HUDProps {
  displayTimeMs: number
}

export function HUD({ displayTimeMs }: HUDProps) {
  const { gameState, netWorth, isPaused, togglePause, gameSpeed, cycleSpeed, payDownHeat } = useGameStore()
  const { cash, reputation, globalHeat, turn, lastLayLowTurn, commodityPrices } = gameState
  const nw = netWorth()
  const [showStats, setShowStats] = useState(false)

  const layLowCost = CONFIG.layLow.cost
  const canLayLow = cash >= layLowCost && globalHeat > 0 &&
    turn - (lastLayLowTurn ?? 0) >= CONFIG.layLow.cooldownWeeks

  return (
    <div className="flex flex-col bg-gray-900 border-b border-gray-700">
    <div className="flex items-center gap-6 px-6 py-3">
      {/* Clock */}
      <GameClock
        displayTimeMs={displayTimeMs}
        isPaused={isPaused}
        onTogglePause={togglePause}
        gameSpeed={gameSpeed}
        onCycleSpeed={cycleSpeed}
      />

      <div className="w-px h-10 bg-gray-700" />

      {/* Cash */}
      <div className="flex flex-col shrink-0">
        <span className="text-xs text-gray-500 font-mono uppercase tracking-widest">Cash</span>
        <span className="text-lg font-bold font-mono text-emerald-400">
          ${cash.toLocaleString()}
        </span>
      </div>

      {/* Net Worth */}
      <div className="flex flex-col shrink-0">
        <span className="text-xs text-gray-500 font-mono uppercase tracking-widest">Net Worth</span>
        <span className="text-lg font-bold font-mono text-yellow-400">
          ${nw.toLocaleString()}
        </span>
      </div>

      <div className="w-px h-10 bg-gray-700" />

      {/* Meters */}
      <div className="flex flex-col gap-2 flex-1 max-w-xs">
        <Meter
          label="Reputation"
          value={reputation}
          max={100}
          color={reputation >= 60 ? 'bg-blue-400' : reputation >= 30 ? 'bg-blue-500' : 'bg-red-500'}
          format={v => `${v}/100`}
        />
        <Meter
          label="Global Heat"
          value={globalHeat}
          max={100}
          color={globalHeat >= 60 ? 'bg-red-500' : globalHeat >= 30 ? 'bg-orange-400' : 'bg-orange-300'}
          format={v => `${v}/100`}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5 shrink-0">
        <div className="relative group">
          <button
            onClick={payDownHeat}
            disabled={!canLayLow}
            className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors w-full ${
              canLayLow
                ? 'bg-gray-800 hover:bg-gray-700 text-orange-400 border-gray-700'
                : 'bg-gray-900 text-gray-700 border-gray-800 cursor-not-allowed'
            }`}
          >
            Lay Low
          </button>
          <div className="absolute top-full mt-1 right-0 bg-gray-950 border border-gray-700 rounded px-2.5 py-1.5 text-xs font-mono shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 w-48">
            <div className="text-gray-300 font-semibold mb-0.5">Lay Low</div>
            <div className="text-gray-500">Reduce global heat by {CONFIG.layLow.heatReduction} for ${layLowCost.toLocaleString()}</div>
            <div className="text-gray-600 mt-0.5">{CONFIG.layLow.cooldownWeeks} week cooldown</div>
          </div>
        </div>
        <button
          onClick={() => setShowStats(true)}
          className="text-xs font-mono px-2.5 py-1 rounded border bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 border-gray-700 transition-colors"
        >
          Stats
        </button>
      </div>

      {/* Commodity Inventory */}
      {(() => {
        // Aggregate inventory across all cities
        const totals: Record<string, number> = {}
        const perCity: Record<string, Record<string, number>> = {}
        for (const [cid, stock] of Object.entries(gameState.cityInventory)) {
          for (const [key, qty] of Object.entries(stock)) {
            if (qty > 0) {
              totals[key] = (totals[key] ?? 0) + qty
              if (!perCity[key]) perCity[key] = {}
              perCity[key]![cid] = qty
            }
          }
        }

        const commodityEntries = Object.entries(totals)
        if (commodityEntries.length === 0) return null

        return (
          <InventoryStrip commodities={commodityEntries} perCity={perCity} />
        )
      })()}

      {/* Logo */}
      <div className="ml-auto shrink-0 select-none" aria-hidden>
        <div className="font-black font-mono leading-none tracking-tighter text-right text-xl">
          <span className="text-red-600">CONTRA</span>
          <span className="text-red-700 opacity-80"> // BAND</span>
        </div>
        <div className="text-right text-gray-700 font-mono" style={{ fontSize: '9px', letterSpacing: '0.18em' }}>
          GLOBAL OPS
        </div>
      </div>

      {/* Stats modal */}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
    </div>

    {/* Market ticker strip */}
    <MarketTicker prices={commodityPrices ?? {}} />
    </div>
  )
}
