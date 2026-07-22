import { getCityName } from '../data/cities'
import { getNetWorth } from './gameState'
import { CONFIG } from './config'
import type { GameState, LiveEvent, CrackdownRaidResult } from './gameState'

// ── Event factory ─────────────────────────────────────────────────────────────

let _eventSeq = 0

/** Create a LiveEvent with an auto-incrementing id. */
export function makeEvent(
  gameTimeMs: number,
  message: string,
  type: LiveEvent['type'] = 'info',
): LiveEvent {
  return { id: `e_${++_eventSeq}`, gameTimeMs, message, type }
}

/** Format a route as "City A → City B" using display names. */
export function routeLabel(origin: string, destination: string): string {
  return `${getCityName(origin)} → ${getCityName(destination)}`
}

/** Append new events to state, capped at CONFIG.ui.eventFeedCap. */
export function appendEvents(state: GameState, newEvents: LiveEvent[]): GameState {
  const combined = [...state.events, ...newEvents]
  return { ...state, events: combined.slice(-CONFIG.ui.eventFeedCap) }
}

// ── Win / lose check ──────────────────────────────────────────────────────────

/** Evaluate win/lose conditions and update phase/winState if triggered. */
export function checkWinLose(state: GameState, gameTimeMs = 0): GameState {
  if (state.winState !== null) return state

  const nw = getNetWorth(state)

  // Bankrupt: can't recover even by liquidating the entire fleet.
  // Raw cash dips (e.g. maintenance right after buying a vehicle) are not
  // game-ending as long as fleet resale value keeps net worth positive.
  if (nw <= 0)                      return { ...state, phase: 'game_over', winState: 'lose_bankrupt' }
  if (state.reputation <= 0)        return { ...state, phase: 'game_over', winState: 'lose_reputation' }
  if (state.reputation >= CONFIG.winLose.reputationWinAt)
    return { ...state, phase: 'game_over', winState: 'win_reputation' }

  // Warn when cash goes negative but the operation is still solvent
  if (state.cash < 0) {
    const warning = makeEvent(gameTimeMs, `Cash negative ($${state.cash.toLocaleString()}) — complete deliveries or sell a vehicle to recover.`, 'danger')
    return appendEvents(state, [warning])
  }

  return state
}

// ── Tier sets (shared across detection, movement, arrival) ────────────────────

export const INSPECTOR_TIERS = new Set(['domestic', 'regional'])
export const INTERPOL_TIERS  = new Set(['international', 'long_haul'])

// ── Step result type (used by all weekly-tick step functions) ─────────────────

export interface StepResult {
  state: GameState
  events: LiveEvent[]
  crackdownData?: { triggered: boolean; raidedCities: CrackdownRaidResult[] }
}
