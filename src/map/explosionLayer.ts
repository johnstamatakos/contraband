import { Container, Graphics } from 'pixi.js'
import type { ProjectedCity } from './cityLayer'

export interface ExplosionEntry {
  cityId: string
  startMs: number
  reason: 'bust' | 'piracy' | 'rival'
}

const DURATION_MS = 2200

// Visual palette per impound reason
const REASON_COLORS: Record<string, { ring: number; flash: number; spark: number }> = {
  bust:   { ring: 0xff4400, flash: 0xffff88, spark: 0xffcc00 },
  piracy: { ring: 0x00ccff, flash: 0xffffff, spark: 0x88eeff },
  rival:  { ring: 0xcc44ff, flash: 0xffffff, spark: 0xee88ff },
}

export function buildExplosionLayer(): Container {
  const c = new Container()
  c.label = 'explosionLayer'
  return c
}

/**
 * Re-projected each frame so the explosion stays glued to the city even
 * if the player pans/zooms. Returns the still-active subset.
 */
export function tickExplosions(
  container: Container,
  explosions: ExplosionEntry[],
  cityMap: Map<string, ProjectedCity>,
  nowMs: number,
): ExplosionEntry[] {
  container.removeChildren()
  const active = explosions.filter(e => nowMs - e.startMs < DURATION_MS)

  for (const exp of active) {
    const city = cityMap.get(exp.cityId)
    if (!city) continue
    const t = Math.min(1, (nowMs - exp.startMs) / DURATION_MS)
    const g = new Graphics()
    drawExplosion(g, city.px, city.py, t, exp.reason)
    container.addChild(g)
  }

  return active
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

function drawExplosion(g: Graphics, cx: number, cy: number, t: number, reason: string): void {
  const col = REASON_COLORS[reason] ?? REASON_COLORS['bust']!

  // ── Initial flash (t 0→0.15): shrinking bright disc ────────────────────────
  if (t < 0.15) {
    const ft = t / 0.15
    g.circle(cx, cy, 14 * (1 - ft))
    g.fill({ color: col.flash, alpha: 1 - ft })
  }

  // ── 3 staggered expanding rings ─────────────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const delay = i * 0.12
    const end   = 0.75
    if (t <= delay || t > end) continue
    const lt     = (t - delay) / (end - delay)
    const radius = easeOut(lt) * (18 + i * 7)
    const alpha  = Math.max(0, 1 - lt) * (i === 0 ? 0.9 : 0.65)
    const width  = Math.max(0.4, 2.5 * (1 - lt))
    g.circle(cx, cy, radius)
    g.stroke({ color: col.ring, width, alpha })
  }

  // ── 8 spark lines (t 0→0.5) ─────────────────────────────────────────────────
  if (t < 0.5) {
    const st        = t / 0.5
    const sparkAlpha = Math.max(0, 1 - st * 1.4)
    const len        = easeOut(st) * 13
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      g.moveTo(cx + Math.cos(angle) * 4, cy + Math.sin(angle) * 4)
      g.lineTo(cx + Math.cos(angle) * (4 + len), cy + Math.sin(angle) * (4 + len))
    }
    g.stroke({ color: col.spark, width: 1.5, alpha: sparkAlpha })
  }

  // ── 3 smoke puffs drifting up (t 0.1→1.0) ───────────────────────────────────
  if (t > 0.1) {
    const smokeT = (t - 0.1) / 0.9
    for (let i = 0; i < 3; i++) {
      const lt = Math.max(0, smokeT - i * 0.18)
      if (lt <= 0) continue
      const alpha = Math.max(0, 0.3 - lt * 0.3)
      g.circle(cx + (i - 1) * 5, cy - easeOut(lt) * 14, 3 + lt * 5)
      g.fill({ color: 0x888888, alpha })
    }
  }
}
