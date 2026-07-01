import type { GameState, WeatherEvent, WeatherType } from './gameState'
import { CONFIG } from './config'

const WEATHER_TYPES: WeatherType[] = [
  'thunderstorm', 'hurricane', 'typhoon', 'port_fog', 'blizzard', 'monsoon',
]

let weatherSeq = 1

/**
 * Maybe generates a new weather forecast event each weekly tick.
 * Spawn rate and caps are controlled by CONFIG.weather.
 * The returned event has isForecast=true — it activates next turn via stepEndTurn.
 */
export function maybeGenerateWeather(state: GameState): WeatherEvent | null {
  const w = CONFIG.weather
  if (state.weatherEvents.length >= w.maxConcurrentEvents || Math.random() > w.spawnChancePerWeek) return null

  const openRoutes = state.routes.filter(r => r.status === 'open')
  if (openRoutes.length === 0) return null

  const shuffled = [...openRoutes].sort(() => Math.random() - 0.5)
  const count = Math.random() < w.multiRouteChance ? 2 : 1
  const affected = shuffled.slice(0, count)

  return {
    id: `wx_${state.turn}_${weatherSeq++}`,
    type: WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)]!,
    affectedRouteIds: affected.map(r => r.id),
    affectedCityIds: [...new Set(affected.flatMap(r => [r.origin, r.destination]))],
    turnsRemaining: 2, // forecast this week, active for up to 1 week (clearAtMs cuts it short)
    isForecast: true,
    clearAtMs: null,
  }
}
