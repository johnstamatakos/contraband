import type { GameState, WeatherEvent, WeatherType, Route } from './gameState'
import { CONFIG } from './config'
import { CITY_MAP } from '../data/cities'

// Game starts 2026-01-05 — used to derive the in-game month from turn number
const GAME_START_MS = new Date('2026-01-05T00:00:00').getTime()
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function currentMonth(turn: number): number {
  return new Date(GAME_START_MS + turn * WEEK_MS).getMonth() + 1  // 1–12
}

// Returns the min/max latitude of the two endpoint cities for a route
function routeLatRange(route: Route): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const a = CITY_MAP.get(route.origin)
  const b = CITY_MAP.get(route.destination)
  const lats = [a?.lat ?? 0, b?.lat ?? 0]
  const lons = [a?.lon ?? 0, b?.lon ?? 0]
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
  }
}

/**
 * Returns true if the given weather type is plausible on this route
 * given the current in-game month.
 *
 * Rules (Northern-Hemisphere-centric with some Pacific/tropical nuance):
 *   blizzard   — Oct–Mar AND both cities above 30° lat
 *   hurricane  — Jun–Nov AND at least one city in the Atlantic/Gulf basin (lat 10–45, lon <0)
 *   typhoon    — May–Nov AND at least one city in the Pacific basin (lon >90 or lon <−100)
 *   monsoon    — Jun–Sep AND at least one city in South/SE Asia (lat 0–30, lon 65–125)
 *   thunderstorm — Apr–Oct (temperate storm season; skip deep tropics in dry season)
 *   port_fog   — Oct–Apr (cold-season fog)
 */
function weatherFitsRoute(type: WeatherType, route: Route, month: number): boolean {
  const { minLat, maxLat, minLon, maxLon } = routeLatRange(route)

  switch (type) {
    case 'blizzard':
      // Winter only; both cities must be clearly temperate/northern
      return [10, 11, 12, 1, 2, 3].includes(month) && minLat > 30

    case 'hurricane':
      // Atlantic hurricane season; needs an Atlantic/Gulf city
      return [6, 7, 8, 9, 10, 11].includes(month) && maxLat > 10 && minLat < 45 && minLon < 0

    case 'typhoon':
      // Pacific typhoon season; needs a Pacific/East-Asian city
      return [5, 6, 7, 8, 9, 10, 11].includes(month) && (maxLon > 90 || minLon < -100)

    case 'monsoon':
      // South/Southeast Asian monsoon season
      return [6, 7, 8, 9].includes(month) && maxLon > 65 && maxLon < 125 && maxLat < 30 && maxLat > 0

    case 'thunderstorm':
      // Temperate storm season — exclude deep tropics (lat < 10) outside wet season
      return [4, 5, 6, 7, 8, 9, 10].includes(month) || minLat < 15

    case 'port_fog':
      // Cold-season coastal fog
      return [10, 11, 12, 1, 2, 3, 4].includes(month)

    default:
      return true
  }
}

let weatherSeq = 1

/**
 * Maybe generates a new weather forecast event each weekly tick.
 * Spawn rate and caps are controlled by CONFIG.weather.
 * The returned event has isForecast=true — it activates next turn via stepEndTurn.
 */
export function maybeGenerateWeather(state: GameState): WeatherEvent | null {
  const w = CONFIG.weather
  if (state.weatherEvents.length >= w.maxConcurrentEvents || Math.random() > w.spawnChancePerWeek) return null

  const month = currentMonth(state.turn)
  const openRoutes = state.routes.filter(r => r.status === 'open')
  if (openRoutes.length === 0) return null

  // Build candidate list: (weatherType, route) pairs that make geographic/seasonal sense
  const WEATHER_TYPES: WeatherType[] = [
    'thunderstorm', 'hurricane', 'typhoon', 'port_fog', 'blizzard', 'monsoon',
  ]

  const candidates: { type: WeatherType; route: Route }[] = []
  for (const type of WEATHER_TYPES) {
    for (const route of openRoutes) {
      if (weatherFitsRoute(type, route, month)) {
        candidates.push({ type, route })
      }
    }
  }

  if (candidates.length === 0) return null

  // Pick a random candidate; optionally expand to an adjacent route of the same type
  const pick = candidates[Math.floor(Math.random() * candidates.length)]!
  const affectedRoutes = [pick.route]

  if (Math.random() < w.multiRouteChance) {
    const extra = openRoutes.filter(
      r => r.id !== pick.route.id && weatherFitsRoute(pick.type, r, month),
    )
    if (extra.length > 0) {
      affectedRoutes.push(extra[Math.floor(Math.random() * extra.length)]!)
    }
  }

  return {
    id: `wx_${state.turn}_${weatherSeq++}`,
    type: pick.type,
    affectedRouteIds: affectedRoutes.map(r => r.id),
    affectedCityIds: [...new Set(affectedRoutes.flatMap(r => [r.origin, r.destination]))],
    turnsRemaining: 4,
    isForecast: true,
    clearAtMs: null,
  }
}
