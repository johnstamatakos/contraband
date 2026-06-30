import type { GameState, WeatherEvent, WeatherType } from './gameState'

const WEATHER_TYPES: WeatherType[] = [
  'thunderstorm', 'hurricane', 'typhoon', 'port_fog', 'blizzard', 'monsoon',
]

let weatherSeq = 1

/**
 * 12% chance each turn to generate a new weather forecast event.
 * Caps at 2 total active events (forecast + active combined).
 * The returned event has isForecast=true — it activates next turn after stepEndTurn.
 */
export function maybeGenerateWeather(state: GameState): WeatherEvent | null {
  if (state.weatherEvents.length >= 2 || Math.random() > 0.12) return null

  const openRoutes = state.routes.filter(r => r.status === 'open')
  if (openRoutes.length === 0) return null

  const shuffled = [...openRoutes].sort(() => Math.random() - 0.5)
  const count = Math.random() < 0.4 ? 2 : 1
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
