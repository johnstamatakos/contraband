import { useGameStore } from '../store/gameStore'
import type { LiveEvent } from '../engine/gameState'
import { formatGameDateShort } from '../utils/gameTime'
import { WEEK_MS } from '../engine/constants'

const NOISE_PATTERNS = [
  'Contact fees',
  'Fleet maintenance',
  'new contract',
  'expired contract',
]

function isNoise(entry: LiveEvent): boolean {
  return NOISE_PATTERNS.some(p => entry.message.includes(p))
}

function entryIcon(type: LiveEvent['type']): string {
  switch (type) {
    case 'success': return '✓'
    case 'warning': return '⚠'
    case 'danger':  return '✗'
    default:        return '·'
  }
}

function entryColor(type: LiveEvent['type']): string {
  switch (type) {
    case 'success': return 'text-emerald-400'
    case 'warning': return 'text-yellow-400'
    case 'danger':  return 'text-red-400'
    default:        return 'text-gray-400'
  }
}

export function EventFeed({ currentTimeMs }: { currentTimeMs: number }) {
  const events = useGameStore(s => s.gameState.events)

  const visible = events
    .filter(e => !isNoise(e))
    .filter(e => currentTimeMs - e.gameTimeMs < 3 * WEEK_MS)
    .slice(-8)

  if (visible.length === 0) return null

  return (
    <div
      className="absolute bottom-8 right-3 w-72 pointer-events-none z-10 space-y-0.5"
    >
      {visible.map((entry, i) => {
        // Oldest entries fade toward top
        const opacity = 0.3 + (i / (visible.length - 1 || 1)) * 0.7
        return (
          <div
            key={entry.id}
            className="flex items-start gap-1.5 px-2 py-1 rounded bg-gray-950/80"
            style={{ opacity }}
          >
            <span className={`shrink-0 text-xs font-mono mt-px ${entryColor(entry.type)}`}>
              {entryIcon(entry.type)}
            </span>
            <span className={`text-xs font-mono leading-4 flex-1 ${entryColor(entry.type)}`}>
              {entry.message}
            </span>
            <span className="text-xs font-mono text-gray-700 shrink-0 mt-px">
              {formatGameDateShort(entry.gameTimeMs)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
