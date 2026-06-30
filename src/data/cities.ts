import type { City } from '../engine/gameState'

// hasAirport: planes can land/depart
// hasPort: ships can dock (ocean or major inland waterway access)
// All cities have road access for trucks, but trucks can only travel overland routes

export const CITIES: City[] = [
  // ── North America ────────────────────────────────────────────────────────
  { id: 'chicago',     name: 'Chicago',      lat: 41.88,  lon: -87.63,  tier: 'major_hub', hasAirport: true,  hasPort: false }, // inland — Lake Michigan, no ocean port
  { id: 'new_york',    name: 'New York',     lat: 40.71,  lon: -74.01,  tier: 'major_hub', hasAirport: true,  hasPort: true  },
  { id: 'houston',     name: 'Houston',      lat: 29.76,  lon: -95.37,  tier: 'regional',  hasAirport: true,  hasPort: true  }, // Gulf Coast
  { id: 'miami',       name: 'Miami',        lat: 25.76,  lon: -80.19,  tier: 'regional',  hasAirport: true,  hasPort: true  },
  { id: 'toronto',     name: 'Toronto',      lat: 43.65,  lon: -79.38,  tier: 'regional',  hasAirport: true,  hasPort: false }, // inland
  { id: 'los_angeles', name: 'Los Angeles',  lat: 34.05,  lon: -118.24, tier: 'major_hub', hasAirport: true,  hasPort: true  },
  { id: 'mexico_city', name: 'Mexico City',  lat: 19.43,  lon: -99.13,  tier: 'regional',  hasAirport: true,  hasPort: false }, // high-altitude inland

  // ── South America ─────────────────────────────────────────────────────────
  { id: 'bogota',      name: 'Bogotá',       lat: 4.71,   lon: -74.07,  tier: 'regional',  hasAirport: true,  hasPort: false }, // inland, elevation 2600m
  { id: 'sao_paulo',   name: 'São Paulo',    lat: -23.55, lon: -46.63,  tier: 'major_hub', hasAirport: true,  hasPort: true  }, // port of Santos

  // ── Europe ────────────────────────────────────────────────────────────────
  { id: 'london',      name: 'London',       lat: 51.51,  lon: -0.13,   tier: 'major_hub', hasAirport: true,  hasPort: true  },
  { id: 'rotterdam',   name: 'Rotterdam',    lat: 51.92,  lon: 4.48,    tier: 'regional',  hasAirport: true,  hasPort: true  }, // largest port in Europe
  { id: 'frankfurt',   name: 'Frankfurt',    lat: 50.11,  lon: 8.68,    tier: 'major_hub', hasAirport: true,  hasPort: false }, // inland Germany
  { id: 'madrid',      name: 'Madrid',       lat: 40.42,  lon: -3.70,   tier: 'regional',  hasAirport: true,  hasPort: false }, // inland Spain

  // ── Middle East / Africa ──────────────────────────────────────────────────
  { id: 'dubai',       name: 'Dubai',        lat: 25.20,  lon: 55.27,   tier: 'major_hub', hasAirport: true,  hasPort: true  },
  { id: 'nairobi',     name: 'Nairobi',      lat: -1.29,  lon: 36.82,   tier: 'regional',  hasAirport: true,  hasPort: false }, // inland Kenya

  // ── Asia ──────────────────────────────────────────────────────────────────
  { id: 'mumbai',      name: 'Mumbai',       lat: 19.08,  lon: 72.88,   tier: 'major_hub', hasAirport: true,  hasPort: true  },
  { id: 'bangkok',     name: 'Bangkok',      lat: 13.76,  lon: 100.50,  tier: 'regional',  hasAirport: true,  hasPort: true  }, // Gulf of Thailand
  { id: 'singapore',   name: 'Singapore',    lat: 1.35,   lon: 103.82,  tier: 'major_hub', hasAirport: true,  hasPort: true  },
  { id: 'shanghai',    name: 'Shanghai',     lat: 31.23,  lon: 121.47,  tier: 'major_hub', hasAirport: true,  hasPort: true  },
  { id: 'tokyo',       name: 'Tokyo',        lat: 35.68,  lon: 139.69,  tier: 'major_hub', hasAirport: true,  hasPort: true  },
  { id: 'hong_kong',   name: 'Hong Kong',    lat: 22.32,  lon: 114.17,  tier: 'major_hub', hasAirport: true,  hasPort: true  },
]

export const CITY_MAP = new Map<string, City>(CITIES.map(c => [c.id, c]))

export function getCityName(id: string): string {
  return CITY_MAP.get(id)?.name ?? id
}
