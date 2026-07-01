import { formatGameDateTime } from '../utils/gameTime'

const SPEED_NEXT: Record<1 | 2 | 4, 1 | 2 | 4> = { 1: 2, 2: 4, 4: 1 }

interface GameClockProps {
  displayTimeMs: number
  isPaused: boolean
  onTogglePause: () => void
  gameSpeed: 1 | 2 | 4
  onCycleSpeed: () => void
}

export function GameClock({ displayTimeMs, isPaused, onTogglePause, gameSpeed, onCycleSpeed }: GameClockProps) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className="flex flex-col items-start">
        <span className="text-xs text-gray-500 font-mono uppercase tracking-widest leading-none mb-0.5">
          Date
        </span>
        <span
          className={`text-sm font-bold font-mono tracking-wide transition-opacity ${
            isPaused ? 'text-gray-500' : 'text-white'
          }`}
        >
          {formatGameDateTime(displayTimeMs)}
        </span>
      </div>

      <button
        onClick={onTogglePause}
        title={isPaused ? 'Resume' : 'Pause'}
        className={`px-2.5 py-1.5 rounded border text-xs font-mono transition-colors ${
          isPaused
            ? 'bg-amber-900 border-amber-700 text-amber-300 hover:bg-amber-800'
            : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
        }`}
      >
        {isPaused ? '▶ Resume' : '⏸ Pause'}
      </button>

      <button
        onClick={onCycleSpeed}
        title={`Speed: ${gameSpeed}x — click for ${SPEED_NEXT[gameSpeed]}x`}
        className={`px-2.5 py-1.5 rounded border text-xs font-mono transition-colors ${
          gameSpeed === 1
            ? 'bg-gray-800 border-gray-600 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            : gameSpeed === 2
            ? 'bg-blue-950 border-blue-700 text-blue-300 hover:bg-blue-900'
            : 'bg-amber-950 border-amber-600 text-amber-300 hover:bg-amber-900'
        }`}
      >
        ⏩ {gameSpeed}x
      </button>
    </div>
  )
}
