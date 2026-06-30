import { GAME_START_MS, WEEK_MS } from '../engine/constants'

// 1 game week = WEEK_MS real ms; scale real ms → game calendar ms
const GAME_SPEED = (7 * 24 * 60 * 60 * 1000) / WEEK_MS

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS_LONG = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Full clock display: "MON 05 JAN 2026 — 14:00" */
export function formatGameDateTime(realMs: number): string {
  const d = new Date(GAME_START_MS + realMs * GAME_SPEED)
  const day = DAYS[d.getDay()]
  const date = String(d.getDate()).padStart(2, '0')
  const month = MONTHS_LONG[d.getMonth()]
  const year = d.getFullYear()
  const hour = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${date} ${month} ${year} — ${hour}:${min}`
}

/** Short date for event log: "5 Jan" */
export function formatGameDateShort(realMs: number): string {
  const d = new Date(GAME_START_MS + realMs * GAME_SPEED)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

/** Week boundary date for reports: "5 Jan 2026" */
export function formatWeekDate(weekNumber: number): string {
  const d = new Date(GAME_START_MS + weekNumber * 7 * 24 * 60 * 60 * 1000)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}
