import { useRef, useState, useEffect, useCallback } from 'react'
import { useGameStore, setCurrentGameTimeMs } from '../store/gameStore'
import { WEEK_MS, DAY_MS } from '../engine/constants'
import { CONFIG } from '../engine/config'

/**
 * Real-time game clock.
 *
 * - Advances `gameTimeMsRef` via rAF when not paused
 * - Checks for shipment arrivals and weekly boundary each frame
 * - Exposes `displayTimeMs` (updated every 100ms) for clock rendering
 * - Exposes `gameTimeMsRef` so Pixi can read current time without re-renders
 */
export function useGameClock() {
  const gameTimeMsRef = useRef(0)
  const lastRafTimeRef = useRef<number | null>(null)
  const lastWeekRef = useRef(0)
  const seededRef = useRef(false)
  const prevGameVersionRef = useRef<number | null>(null)
  const [displayTimeMs, setDisplayTimeMs] = useState(0)

  // Watch gameVersion — reset clock only when newGame() is called, not on initial mount
  // (initial mount with a restored save must NOT reset the clock to 0).
  const gameVersion = useGameStore(s => s.gameState.gameVersion)
  useEffect(() => {
    if (prevGameVersionRef.current === null) {
      // First mount — skip the reset; clock will be seeded by the hydration subscription below
      prevGameVersionRef.current = gameVersion
      return
    }
    // gameVersion changed = newGame() was called
    prevGameVersionRef.current = gameVersion
    seededRef.current = false
    gameTimeMsRef.current = 0
    lastRafTimeRef.current = null
    lastWeekRef.current = 0
    setCurrentGameTimeMs(0)
    setDisplayTimeMs(0)
  }, [gameVersion])

  // (Clock seeding from persisted save is handled inside the rAF loop below,
  //  so it fires reliably regardless of async hydration timing.)

  // 100ms interval: sync displayTimeMs for React rendering (clock display)
  useEffect(() => {
    const id = setInterval(() => {
      setDisplayTimeMs(gameTimeMsRef.current)
      setCurrentGameTimeMs(gameTimeMsRef.current)
    }, 100)
    return () => clearInterval(id)
  }, [])

  const checkArrivals = useCallback((now: number) => {
    const eu = CONFIG.vehicleUpgrades.effects.engine
    // Re-read state after each resolution so recurring redispatches are visible
    // to subsequent iterations and to the weekly tick that follows.
    let resolved = true
    while (resolved) {
      resolved = false
      const { gameState, resolveArrival } = useGameStore.getState()
      const frozenRouteIds = new Set(
        gameState.weatherEvents
          .filter(e => !e.isForecast)
          .flatMap(e => e.affectedRouteIds),
      )
      const skillSpeedMult = gameState.unlockedSkills.includes('logistics_2')
        ? CONFIG.skills.effects.logistics_2.transitTimeMultiplier
        : 1.0
      for (const s of gameState.shipmentsInTransit) {
        if (frozenRouteIds.has(s.routeId)) continue
        const vehicle = gameState.fleet.find(v => v.id === s.vehicleId)
        const engineTier = vehicle?.upgrades.engine ?? 0
        const engineMult = engineTier === 2 ? eu.tier2TransitMultiplier : engineTier === 1 ? eu.tier1TransitMultiplier : 1.0
        const arrivalTime = s.departureTimeMs + s.totalTurns * DAY_MS * skillSpeedMult * engineMult + s.frozenDurationMs
        if (now >= arrivalTime) {
          resolveArrival(s.id, now)
          resolved = true
          break // re-read state from scratch
        }
      }
    }
  }, [])

  const checkWeatherExpiry = useCallback((now: number) => {
    const { gameState, clearWeatherEvent } = useGameStore.getState()
    for (const e of gameState.weatherEvents) {
      if (!e.isForecast && e.clearAtMs !== null && now >= e.clearAtMs) {
        clearWeatherEvent(e.id, now)
      }
    }
  }, [])

  const checkRouteOpenings = useCallback((now: number) => {
    const { gameState, openPendingRoute } = useGameStore.getState()
    for (const r of gameState.routes) {
      if (r.status === 'pending' && r.openAtMs !== null && now >= r.openAtMs) {
        openPendingRoute(r.id, now)
      }
    }
  }, [])

  const checkWeeklyBoundary = useCallback((now: number) => {
    const week = Math.floor(now / WEEK_MS)
    if (week > lastWeekRef.current) {
      lastWeekRef.current = week
      const { weeklyTick, gameState } = useGameStore.getState()
      if (gameState.phase !== 'game_over') {
        weeklyTick(week, now)
      }
    }
  }, [])

  // rAF loop: advance time and check events
  useEffect(() => {
    let rafId: number

    function tick(now: number) {
      const { isPaused, hasStarted, savedTimeMs, gameState } = useGameStore.getState()

      // Seed from persisted save — fires once after async hydration completes
      if (!seededRef.current && savedTimeMs > 0) {
        seededRef.current = true
        gameTimeMsRef.current = savedTimeMs
        lastWeekRef.current = Math.floor(savedTimeMs / WEEK_MS)
        setCurrentGameTimeMs(savedTimeMs)
        setDisplayTimeMs(savedTimeMs)
      }

      const reportOpen = gameState.lastWeeklySummary !== null
      const gameOver = gameState.phase === 'game_over'

      if (!isPaused && !reportOpen && !gameOver && hasStarted) {
        const delta = lastRafTimeRef.current !== null ? now - lastRafTimeRef.current : 0
        // Cap delta to 200ms to prevent huge jumps after tab switching
        const clampedDelta = Math.min(delta, 200) * useGameStore.getState().gameSpeed
        gameTimeMsRef.current += clampedDelta
        // Keep currentGameTimeMs in sync every frame so store actions (e.g. establishRoute)
        // always read an accurate value when computing openAtMs deadlines.
        setCurrentGameTimeMs(gameTimeMsRef.current)
        checkArrivals(gameTimeMsRef.current)
        checkWeeklyBoundary(gameTimeMsRef.current)
        checkRouteOpenings(gameTimeMsRef.current)
        checkWeatherExpiry(gameTimeMsRef.current)
      }

      lastRafTimeRef.current = now
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [checkArrivals, checkWeeklyBoundary, checkRouteOpenings, checkWeatherExpiry])

  return { gameTimeMsRef, displayTimeMs }
}
