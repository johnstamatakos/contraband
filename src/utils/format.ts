/** Format a dollar amount: 12345 → "$12,345" */
export function formatCash(amount: number): string {
  return `$${amount.toLocaleString()}`
}

/** Format a positive cash delta: 500 → "+$500" */
export function formatCashGain(amount: number): string {
  return `+$${amount.toLocaleString()}`
}

/** Format a ratio as a rounded percentage string: 0.42 → "42%" */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

/** Format a multiplier as a human-readable reduction: 0.80 → "−20%" */
export function formatMultiplierReduction(multiplier: number): string {
  return `−${Math.round((1 - multiplier) * 100)}%`
}
