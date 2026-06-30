import { formatGameDateTime } from '../utils/gameTime'

interface GameClockProps {
  displayTimeMs: number
  isPaused: boolean
  onTogglePause: () => void
}

export function GameClock({ displayTimeMs, isPaused, onTogglePause }: GameClockProps) {
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
    </div>
  )
}
