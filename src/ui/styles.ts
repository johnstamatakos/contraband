/**
 * Shared Tailwind className constants.
 *
 * Import these instead of copying long class strings across components.
 * All values are plain strings — no runtime cost, just a single source of truth.
 */

// ── Typography ────────────────────────────────────────────────────────────────

/** Standard small mono label: "text-xs font-mono" */
export const MONO_XS = 'text-xs font-mono'

/** Section heading inside a panel: uppercase, muted, spaced */
export const SECTION_LABEL = 'text-xs font-mono font-semibold text-gray-300 uppercase tracking-wider'

// ── Badges ────────────────────────────────────────────────────────────────────

/** Base badge — combine with a color class */
export const BADGE = 'text-xs font-mono px-1 py-0.5 rounded'

/** Upgrade badge colors keyed by upgrade type */
export const UPGRADE_BADGE_CLS = {
  cargo:       'bg-blue-950 text-blue-400 border border-blue-800',
  engine:      'bg-amber-950 text-amber-400 border border-amber-800',
  concealment: 'bg-emerald-950 text-emerald-400 border border-emerald-800',
} as const

/** Risk badge colors keyed by risk level */
export const RISK_BADGE_CLS = {
  LOW:  'text-green-400 bg-green-900',
  MED:  'text-yellow-400 bg-yellow-900',
  HIGH: 'text-red-400 bg-red-900',
} as const

// ── Buttons ───────────────────────────────────────────────────────────────────

/** Full-width action button base (add color/hover classes as needed) */
export const ACTION_BTN = 'w-full text-xs font-mono py-1.5 rounded transition-colors'

/** Tab-style filter button */
export const TAB_BTN_ACTIVE   = 'flex-1 text-xs font-mono py-1 rounded transition-colors bg-gray-700 text-white'
export const TAB_BTN_INACTIVE = 'flex-1 text-xs font-mono py-1 rounded transition-colors text-gray-500 hover:text-gray-300'

// ── Section header row ────────────────────────────────────────────────────────

/** Non-collapsible section header row */
export const SECTION_HEADER_ROW = 'flex items-center justify-between px-2 py-1.5 rounded bg-gray-800 mb-2'

/** Collapsible section header button */
export const SECTION_HEADER_BTN = 'w-full flex items-center justify-between px-2 py-1.5 rounded bg-gray-800 hover:bg-gray-700 transition-colors'
