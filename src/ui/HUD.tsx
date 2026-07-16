import { useGameStore } from '../store/gameStore'
import { GameClock } from './GameClock'
import { CONFIG } from '../engine/config'

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

interface HUDProps {
  displayTimeMs: number
}

export function HUD({ displayTimeMs }: HUDProps) {
  const { gameState, netWorth, isPaused, togglePause, gameSpeed, cycleSpeed, payDownHeat } = useGameStore()
  const { cash, reputation, globalHeat, turn, lastLayLowTurn } = gameState
  const nw = netWorth()

  const layLowCost = CONFIG.layLow.cost
  const canLayLow = cash >= layLowCost && globalHeat > 0 &&
    turn - (lastLayLowTurn ?? 0) >= CONFIG.layLow.cooldownWeeks

  return (
    <div className="flex items-center gap-6 px-6 py-3 bg-gray-900 border-b border-gray-700">
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
          <span className="text-xs text-gray-500 ml-1">/ ${(CONFIG.winLose.netWorthGoal / 1000).toFixed(0)}K</span>
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
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Meter
              label="Global Heat"
              value={globalHeat}
              max={100}
              color={globalHeat >= 60 ? 'bg-red-500' : globalHeat >= 30 ? 'bg-orange-400' : 'bg-orange-300'}
              format={v => `${v}/100`}
            />
          </div>
          <button
            onClick={payDownHeat}
            disabled={!canLayLow}
            title={`Lay Low: -${CONFIG.layLow.heatReduction} heat ($${layLowCost.toLocaleString()})`}
            className={`shrink-0 text-xs font-mono px-2 py-1 rounded border transition-colors ${
              canLayLow
                ? 'bg-gray-800 hover:bg-gray-700 text-orange-400 border-gray-700'
                : 'bg-gray-900 text-gray-700 border-gray-800 cursor-not-allowed'
            }`}
          >
            Lay Low
          </button>
        </div>
      </div>

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
    </div>
  )
}
