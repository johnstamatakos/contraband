// ─── City commodity definitions ──────────────────────────────────────────────
// Each city has legit and illicit exports/imports. When a contract's route
// matches an export→import commodity, the payout gets a bonus multiplier.

export interface CityCommod {
  legitExports: string[]
  legitImports: string[]
  illicitExports: string[]
  illicitImports: string[]
}

export const CITY_COMMODITIES: Record<string, CityCommod> = {
  // ── North America ──────────────────────────────────────────────────────────
  chicago: {
    legitExports: ['Electronics', 'Machinery', 'Industrial Equipment'],
    legitImports: ['Raw Materials', 'Textiles', 'Agricultural Products'],
    illicitExports: [],
    illicitImports: ['Narcotics', 'Counterfeit Electronics'],
  },
  new_york: {
    legitExports: ['Pharmaceuticals', 'Consumer Goods'],
    legitImports: ['Electronics', 'Textiles'],
    illicitExports: ['Smuggled Currency'],
    illicitImports: ['Narcotics', 'Counterfeit Electronics'],
  },
  houston: {
    legitExports: ['Chemicals', 'Industrial Equipment'],
    legitImports: ['Electronics', 'Consumer Goods'],
    illicitExports: [],
    illicitImports: ['Narcotics'],
  },
  miami: {
    legitExports: ['Consumer Goods', 'Medical Supplies'],
    legitImports: ['Agricultural Products', 'Textiles'],
    illicitExports: [],
    illicitImports: ['Narcotics', 'Smuggled Currency'],
  },
  toronto: {
    legitExports: ['Auto Parts', 'Medical Supplies'],
    legitImports: ['Electronics', 'Consumer Goods'],
    illicitExports: [],
    illicitImports: ['Counterfeit Electronics'],
  },
  los_angeles: {
    legitExports: ['Consumer Goods', 'Electronics'],
    legitImports: ['Auto Parts', 'Textiles', 'Raw Materials'],
    illicitExports: [],
    illicitImports: ['Narcotics', 'Restricted Tech'],
  },
  mexico_city: {
    legitExports: ['Agricultural Products', 'Textiles'],
    legitImports: ['Machinery', 'Electronics'],
    illicitExports: ['Narcotics', 'Counterfeit Electronics'],
    illicitImports: [],
  },

  // ── South America ──────────────────────────────────────────────────────────
  bogota: {
    legitExports: ['Agricultural Products', 'Raw Materials'],
    legitImports: ['Machinery', 'Pharmaceuticals'],
    illicitExports: ['Narcotics', 'Smuggled Currency'],
    illicitImports: [],
  },
  sao_paulo: {
    legitExports: ['Raw Materials', 'Agricultural Products'],
    legitImports: ['Electronics', 'Machinery'],
    illicitExports: ['Smuggled Currency'],
    illicitImports: ['Restricted Tech'],
  },

  // ── Europe ─────────────────────────────────────────────────────────────────
  london: {
    legitExports: ['Pharmaceuticals', 'Consumer Goods'],
    legitImports: ['Electronics', 'Agricultural Products'],
    illicitExports: ['Forged Documents'],
    illicitImports: ['Narcotics', 'Smuggled Currency'],
  },
  rotterdam: {
    legitExports: ['Chemicals', 'Industrial Equipment'],
    legitImports: ['Raw Materials', 'Consumer Goods'],
    illicitExports: [],
    illicitImports: ['Narcotics', 'Contraband Chemicals'],
  },
  frankfurt: {
    legitExports: ['Machinery', 'Auto Parts'],
    legitImports: ['Consumer Goods', 'Raw Materials', 'Agricultural Products'],
    illicitExports: ['Restricted Tech'],
    illicitImports: ['Smuggled Currency', 'Forged Documents'],
  },
  madrid: {
    legitExports: ['Agricultural Products', 'Textiles'],
    legitImports: ['Machinery', 'Electronics'],
    illicitExports: [],
    illicitImports: ['Narcotics', 'Smuggled Currency'],
  },

  // ── Middle East / Africa ───────────────────────────────────────────────────
  dubai: {
    legitExports: ['Consumer Goods', 'Chemicals'],
    legitImports: ['Electronics', 'Machinery'],
    illicitExports: ['Smuggled Currency'],
    illicitImports: ['Restricted Tech', 'Narcotics'],
  },
  nairobi: {
    legitExports: ['Agricultural Products', 'Raw Materials'],
    legitImports: ['Pharmaceuticals', 'Consumer Goods'],
    illicitExports: ['Contraband Chemicals'],
    illicitImports: ['Restricted Tech'],
  },

  // ── Asia ───────────────────────────────────────────────────────────────────
  mumbai: {
    legitExports: ['Textiles', 'Pharmaceuticals'],
    legitImports: ['Machinery', 'Electronics'],
    illicitExports: ['Black Market Pharmaceuticals'],
    illicitImports: ['Restricted Tech', 'Narcotics'],
  },
  bangkok: {
    legitExports: ['Agricultural Products', 'Textiles'],
    legitImports: ['Electronics', 'Machinery'],
    illicitExports: ['Black Market Pharmaceuticals', 'Narcotics'],
    illicitImports: ['Smuggled Currency'],
  },
  singapore: {
    legitExports: ['Electronics', 'Consumer Goods'],
    legitImports: ['Raw Materials', 'Chemicals'],
    illicitExports: [],
    illicitImports: ['Narcotics', 'Restricted Tech'],
  },
  shanghai: {
    legitExports: ['Electronics', 'Consumer Goods'],
    legitImports: ['Raw Materials', 'Chemicals'],
    illicitExports: ['Counterfeit Electronics', 'Restricted Tech'],
    illicitImports: ['Smuggled Currency'],
  },
  tokyo: {
    legitExports: ['Electronics', 'Auto Parts'],
    legitImports: ['Raw Materials', 'Agricultural Products'],
    illicitExports: ['Restricted Tech'],
    illicitImports: ['Narcotics', 'Smuggled Currency'],
  },
  hong_kong: {
    legitExports: ['Consumer Goods', 'Electronics'],
    legitImports: ['Textiles', 'Raw Materials'],
    illicitExports: ['Counterfeit Electronics', 'Smuggled Currency'],
    illicitImports: ['Narcotics'],
  },
}

// ─── Smuggling commodity helpers ─────────────────────────────────────────────

import { CONFIG } from '../engine/config'

/** Build a reverse map from display name → config key (e.g. 'Narcotics' → 'narcotics'). */
function buildDisplayNameToKeyMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [key, def] of Object.entries(CONFIG.smuggling.commodities)) {
    map[def.displayName] = key
  }
  return map
}

/**
 * Returns illicit commodities available for purchase at a given city.
 * Cross-references the city's illicitExports with CONFIG.smuggling.commodities.
 */
export function getAvailablePurchases(
  cityId: string,
): Array<{ key: string; displayName: string; icon: string; buyPrice: number; tier: number }> {
  const city = CITY_COMMODITIES[cityId]
  if (!city) return []

  const nameToKey = buildDisplayNameToKeyMap()
  const results: Array<{ key: string; displayName: string; icon: string; buyPrice: number; tier: number }> = []

  for (const exportName of city.illicitExports) {
    const key = nameToKey[exportName]
    if (!key) continue
    const def = CONFIG.smuggling.commodities[key as keyof typeof CONFIG.smuggling.commodities]
    if (!def) continue
    results.push({
      key,
      displayName: def.displayName,
      icon: def.icon,
      buyPrice: def.buyPrice,
      tier: def.tier,
    })
  }

  return results
}

/**
 * Returns all cities that import a given commodity, with their sell prices.
 */
export function getSellDestinations(
  commodityKey: string,
): Array<{ cityId: string; sellPrice: number }> {
  const def = CONFIG.smuggling.commodities[commodityKey as keyof typeof CONFIG.smuggling.commodities]
  if (!def) return []

  return Object.entries(def.sellPrices).map(([cityId, sellPrice]) => ({
    cityId,
    sellPrice,
  }))
}

/**
 * Find a commodity that the origin city exports and the destination imports.
 * Returns the matched commodity name or null if no match exists.
 */
export function findCommodityMatch(
  originId: string,
  destId: string,
  isIllicit: boolean,
): string | null {
  const origin = CITY_COMMODITIES[originId]
  const dest = CITY_COMMODITIES[destId]
  if (!origin || !dest) return null

  const exports = isIllicit ? origin.illicitExports : origin.legitExports
  const imports = isIllicit ? dest.illicitImports : dest.legitImports

  const matches = exports.filter(e => imports.includes(e))
  if (matches.length === 0) return null
  return matches[Math.floor(Math.random() * matches.length)]!
}
