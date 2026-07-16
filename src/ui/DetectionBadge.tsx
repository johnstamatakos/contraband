import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { DetectionBreakdown } from '../engine/gameState'

export function riskColor(r: number): string {
  if (r >= 0.5) return 'text-red-400'
  if (r >= 0.25) return 'text-orange-400'
  if (r >= 0.10) return 'text-yellow-600'
  return 'text-gray-500'
}

/** Detection % badge with a hover tooltip showing the per-factor breakdown. */
export function DetectionBadge({ breakdown, faded = false }: { breakdown: DetectionBreakdown; faded?: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const pct = Math.round(breakdown.final * 100)

  const addRows = [
    { label: 'Base',        value: breakdown.base },
    { label: 'Route heat',  value: breakdown.routeHeat },
    { label: 'Global heat', value: breakdown.globalHeat },
    { label: 'Consecutive', value: breakdown.consecutiveRuns },
    { label: 'Threat',      value: breakdown.threatBonus },
    { label: 'Vehicles',    value: breakdown.vehiclePenalty },
    { label: 'Volume',      value: breakdown.volumePenalty },
  ].filter(r => r.value > 0.001)

  const subRows = [
    { label: 'Skills',      value: breakdown.skillsReduction },
    { label: 'Concealment', value: breakdown.concealmentReduction },
    { label: 'Legit cover', value: breakdown.legitCover },
  ].filter(r => r.value > 0.001)

  const tooltip = pos
    ? createPortal(
        <div
          style={{ position: 'fixed', left: pos.x - 72, top: pos.y - 180, zIndex: 9999 }}
          className="bg-gray-950 border border-gray-700 rounded p-2 text-xs font-mono min-w-[9rem] shadow-xl pointer-events-none"
        >
          {addRows.map(r => (
            <div key={r.label} className="flex justify-between gap-3">
              <span className="text-gray-500">{r.label}</span>
              <span className="text-orange-400">+{Math.round(r.value * 100)}%</span>
            </div>
          ))}
          {subRows.map(r => (
            <div key={r.label} className="flex justify-between gap-3">
              <span className="text-gray-500">{r.label}</span>
              <span className="text-green-400">−{Math.round(r.value * 100)}%</span>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-gray-700 mt-1 pt-1">
            <span className="text-gray-300">Detection</span>
            <span className={riskColor(breakdown.final)}>{pct}%</span>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <span
        className={`${riskColor(breakdown.final)} ${faded ? 'opacity-70' : ''} cursor-help font-mono text-xs`}
        onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setPos(null)}
      >
        {pct}%
      </span>
      {tooltip}
    </>
  )
}
