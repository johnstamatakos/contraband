// ── Game-time constants ───────────────────────────────────────────────────────

export const WEEK_MS       = 120_000  // 2 real minutes  = 1 game week
export const DAY_MS        = WEEK_MS / 7  // ~17 real seconds = 1 game day
export const GAME_START_MS = new Date('2026-01-05T00:00:00').getTime()

// ── Internal calendar tables ──────────────────────────────────────────────────

const DAYS         = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
const MONTHS_LONG  = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const REAL_MS_PER_GAME_MS = (7 * 24 * 60 * 60 * 1000) / WEEK_MS

// ── Formatters ────────────────────────────────────────────────────────────────

/** Full clock display: "MON 05 JAN 2026 — 14:00" */
export function formatGameDateTime(realMs: number): string {
  const d = new Date(GAME_START_MS + realMs * REAL_MS_PER_GAME_MS)
  const day   = DAYS[d.getDay()]
  const date  = String(d.getDate()).padStart(2, '0')
  const month = MONTHS_LONG[d.getMonth()]
  const year  = d.getFullYear()
  const hour  = String(d.getHours()).padStart(2, '0')
  const min   = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${date} ${month} ${year} — ${hour}:${min}`
}

/** Short date for event log: "5 Jan" */
export function formatGameDateShort(realMs: number): string {
  const d = new Date(GAME_START_MS + realMs * REAL_MS_PER_GAME_MS)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

/** Week boundary date for reports: "5 Jan 2026" */
export function formatWeekDate(weekNumber: number): string {
  const d = new Date(GAME_START_MS + weekNumber * 7 * 24 * 60 * 60 * 1000)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/** Human-readable game-time remaining from real-ms. */
export function formatTimeRemaining(msLeft: number): string {
  if (msLeft <= 0) return 'Opening...'
  const gameHours = msLeft / (WEEK_MS / 168)
  const gameDays  = gameHours / 24
  if (gameDays  >= 2)    return `~${Math.round(gameDays)} days`
  if (gameDays  >= 0.95) return `~1 day`
  if (gameHours >= 1)    return `~${Math.ceil(gameHours)}h`
  return `~${Math.ceil(gameHours * 60)}m`
}
