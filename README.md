# CONTRABAND

Real-time smuggling strategy game. Run a global cargo network — legitimate freight on the surface, contraband underneath. Built with React, Pixi.js, and Zustand.

## How to Play

### Goal
Reach **100 reputation** by successfully smuggling illicit commodities across the globe. Lose if you go bankrupt or your reputation hits zero.

### Game Loop

1. **Build your network** — Start with 2 trucks and domestic routes (Chicago, New York, Houston). Click cities on the map to establish new routes. Higher-tier routes (international, long haul) require reputation and cash to unlock.

2. **Run legit supply contracts** — Accept recurring supply contracts from the Supply Contracts tab. Assign a vehicle and it loops automatically, generating steady income to fund expansion.

3. **Buy illicit commodities** — Once you've expanded to a source city (Mexico City, Bogota, Bangkok, etc.), click it and find the **Black Market** section. Purchase commodities like Narcotics, Restricted Tech, or Counterfeit Electronics.

4. **Plan smuggling runs** — Click "Smuggle from here" on a city where you have inventory. The planner lets you:
   - Choose a commodity and destination (cities that import it)
   - Auto-routes the shortest path through your network
   - Select vehicles (all must traverse the entire route)
   - Set volume (capped by inventory and vehicle capacity)
   - See real-time per-hop risk and expected profit

5. **Manage risk** — Detection is rolled at each hop. Factors include route heat, global heat, Inspector/Interpol presence, convoy size, cargo volume, and your vehicle concealment upgrades. Getting caught means losing cargo, vehicles, reputation, and route access.

6. **Upgrade and expand** — Buy planes and ships for international routes. Upgrade vehicles (concealment, engine, cargo, range). Unlock skills in the Shadow, Logistics, and Network branches.

### Commodity Tiers

| Tier | Commodities | Sources | Best Margins |
|------|------------|---------|-------------|
| 1 | Narcotics, Counterfeit Electronics | Mexico City, Bogota, Bangkok, Shanghai, Hong Kong | Domestic/Regional |
| 2 | Smuggled Currency, Forged Documents, Black Market Pharma | NY, London, Mumbai, Dubai | International |
| 3 | Restricted Tech, Contraband Chemicals | Frankfurt, Tokyo, Nairobi | Long Haul |

### Threats

- **Inspector** (week 10+) — Patrols North American cities. +25% detection on domestic/regional routes. Busted vehicles can be recovered with a fine.
- **Interpol** (week 20+) — Operates globally with multiple positions. +45% detection on international/long haul routes. Busted vehicles are permanently seized.
- **Weather** — Random storms block routes temporarily.
- **Rivals** (week 15+) — Random sabotage events.

### Key Mechanics

- **Per-hop detection** — Each city along your smuggling route is a checkpoint. Longer routes = more risk but more reward.
- **Convoy trade-off** — More vehicles = more cargo capacity but +3% detection per extra vehicle.
- **Legit cover** — Active legitimate shipments reduce detection slightly.
- **Heat decay** — Global heat decays 2/week naturally. Route heat decays 1/week. Use "Lay Low" for emergency heat reduction.
- **Reputation decay** — After 3 weeks of no smuggling activity, reputation drops 2/week.

## Development

```bash
npm install
npm run dev
```

All game balance values are centralized in `src/engine/config.ts` and can be tuned at runtime via browser console (e.g. `CONFIG.smuggling.commodities.narcotics.buyPrice = 50`).

## Tech Stack

- **Vite** + **TypeScript**
- **React** (UI panels, modals, HUD)
- **Pixi.js** (map rendering — cities, routes, vehicles, weather, threats)
- **Zustand** (game state management)
- **Tailwind CSS** (styling)
- **D3-geo** (world map projection)
