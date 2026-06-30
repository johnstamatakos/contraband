# CONTRABAND — Full Game Specification

## Overview

Single-player web/mobile turn-based strategy game. You run a global cargo operation — legitimate freight on the surface, contraband underneath. Manage a fleet of planes, ships, and trucks. Establish routes. Bid on contracts. Avoid detection. Build your underworld reputation. Win before you go broke or get burned.

---

## Win / Lose Conditions

**Win** — reach $100,000 net worth (cash + fleet value) OR reach 80 reputation
**Lose** — cash hits $0 (bankruptcy) OR reputation hits 0

---

## Starting State

| Attribute | Value |
|-----------|-------|
| Cash | $8,000 |
| Fleet | 1 truck |
| Open routes | Chicago→New York, Chicago→Houston, New York→Miami, New York→Toronto |
| Contacts | None |
| Reputation | 50 |
| Heat (global) | 0 |
| Turn | 1 |

---

## Core Meters

| Meter | Range | Notes |
|-------|-------|-------|
| Cash | $0+ | Drops to $0 = lose |
| Reputation | 0–100 | Hits 0 = lose; hits 80 = win option |
| Heat (global) | 0–100 | Affects all enforcement probability globally |
| Net Worth | Tracked | Cash + fleet resale value; hits $100K = win option |

---

## Turn Structure

Each turn represents one week. Order of operations:

1. **Forecast** — new weather events revealed 1 turn before they hit
2. **Pay fixed costs** — maintenance + active contacts
3. **Advance shipments** — in-transit cargo moves 1 turn forward; weather delays applied to affected routes
4. **Detection rolls** — illicit shipments arriving this turn are checked for detection
5. **Refresh contract board** — expired contracts drop, new ones appear
6. **Move investigator** — 1–2 nodes along partially visible path
7. **Decay route heat** — idle routes lose 1 heat level
8. **Decay global heat** — global heat drops 2 points
9. **Reputation decay** — if no illicit activity in 3+ turns, rep drops 1
10. **Player actions** — establish routes, assign vehicles to contracts, hire/fire contacts, pay bribes, buy/sell fleet
11. **End turn** — confirm and advance

---

## Routes

Routes must be established before any cargo can move on them. Once opened they are permanent. No cargo — legit or illicit — can travel a leg that has not been established.

### Starting Routes

The player begins with four pre-opened domestic routes in North America:

- Chicago → New York
- Chicago → Houston
- New York → Miami
- New York → Toronto

Everything beyond this costs money and 1 turn to establish.

### Establishing a Route

- Costs a flat fee based on tier (see below)
- Takes 1 turn — no cargo can move on the route until the following turn
- Illicit use requires the legit route to be established first; activating the illicit layer on a route costs an additional fee

### Route Tiers

| Tier | Examples | Establish Cost | Illicit Activation Cost | Notes |
|------|----------|---------------|------------------------|-------|
| Domestic | Chicago→Houston | $500 | $300 | Truck-eligible |
| Regional | New York→Toronto, Miami→Bogota | $1,200 | $600 | Any mode |
| International | New York→London | $2,500 | $1,200 | Plane or ship only |
| Long-haul | LA→Tokyo, Rotterdam→Shanghai | $4,000 | $2,000 | High-capacity only |

### Route Strategy

Multi-city contracts require every leg to be open. A contract from Chicago to Rotterdam needs Chicago→New York, New York→London, and London→Rotterdam all established before the player can move cargo. If a leg is missing, the player must either open it, reroute through cities they already have, or pass on the contract.

This means the player is constantly weighing: establish the route now as infrastructure investment, or pass and wait?

---

## Fleet

Contracts do not specify a required transport mode. The player chooses how to fulfill each contract based on cargo volume, geographic constraints, deadlines, cost, and risk tolerance. Cargo can be split across multiple vehicles — partial delivery pays out proportionally.

### Planes

- Speed: 1 turn per route leg
- Capacity: 50 units
- Purchase price: $12,000
- Maintenance per turn: $1,200
- Scrutiny: HIGH — customs check on every arrival
- Illicit risk: cargo manifest anomaly detection
- Bust consequence: shipment seized, heat +15, rep –10
- Resale value: 60% of purchase price

### Ships

- Speed: 3–5 turns per route leg depending on distance
- Capacity: 150 units
- Purchase price: $8,000
- Maintenance per turn: $600
- Scrutiny: MEDIUM — port inspections on arrival
- Illicit risk: full hold inspected on bust — all illicit cargo lost at once
- Bust consequence: entire hold seized, heat +20, rep –15
- Piracy risk: fixed probability on flagged ocean lanes; cargo lost with no heat or rep penalty
- Resale value: 60% of purchase price

### Trucks

- Speed: 1–2 turns per route leg; domestic and regional routes only
- Capacity: 20 units
- Purchase price: $3,000
- Maintenance per turn: $200
- Scrutiny: LOW — highway checkpoints are random
- Illicit risk: weigh station flags, border crossing checks
- Bust consequence: shipment lost, route flagged for 3 turns, heat +10, rep –5
- Resale value: 60% of purchase price

---

## Fixed Costs Per Turn

| Item | Cost |
|------|------|
| Plane (per unit owned) | $1,200 |
| Ship (per unit owned) | $600 |
| Truck (per unit owned) | $200 |
| Customs Insider contact | $800 |
| Port Fixer contact | $700 |
| Informant contact | $600 |
| Fence contact | $500 |
| Underworld Broker contact | $900 |
| Freight Broker contact | $300 |
| Port Agent contact | $500 |
| Airline Partner contact | $400 |

Fleet accrues maintenance whether active or idle. Idle fleet is a slow drain.

---

## Detection System

Every illicit shipment undergoes a detection roll each turn it is in transit and again on delivery.

### Base Detection Probability

```
baseProbability = 0.05 (5%)
```

### Modifiers (additive)

| Factor | Delta |
|--------|-------|
| Route heat level 1 | +2% |
| Route heat level 2 | +4% |
| Route heat level 3 | +6% |
| Route heat level 4 | +8% |
| Route heat level 5 | +10% |
| Global heat per 10 points | +1% |
| Active informant alert in origin or destination city | +20% |
| Investigator stationed at destination | +25% |
| Illicit cargo over 30% of manifest (weight anomaly) | +15% |
| Vehicle overloaded beyond capacity | +20% |
| Same route used for illicit cargo 3 turns in a row | +10% |
| Bribe paid this turn at destination | –15% |
| Illicit contact active at destination | –10% |
| Global heat under 20 | –5% |
| Active storm or blizzard at destination (inspectors distracted) | –5% |

**Cap: 85% maximum. Minimum: 2%.**

---

## Enforcement Actors

### Customs Agents (airports)
- Present at all major airports permanently
- Probability check on every arrival
- Can be bribed for $500 to reduce detection –15% for 2 turns at that airport

### Port Inspectors (ships)
- Rotate between ports on a visible schedule
- Player sees inspector location 1 turn ahead
- Full hold inspection on trigger — all illicit cargo seized
- Cannot be directly bribed; Port Fixer contact reveals schedule 2 turns ahead

### Highway Checkpoints (trucks)
- Randomly placed each turn on domestic routes
- Low base probability; increases at border crossings
- Alternate route available: +1 turn, +$200 fuel cost

### The Investigator
- Single roving agent; appears at turn 8
- Moves 1–2 airports or ports per turn
- Last known location visible on map; probable next destination shown (not guaranteed)
- Landing where the investigator is stationed: detection +25%
- Tracked precisely via Informant contact

### Pirates
- Fixed probability zones on specific ocean lanes, shown on map
- Triggered: cargo lost, no heat gain, no rep penalty
- Avoided by routing around the zone at the cost of 1–2 additional turns

---

## Weather System

Each turn 1–3 weather events are active on the map. They appear as zone overlays with a turn countdown. The player sees incoming weather 1 turn before it hits, giving them time to reroute or adjust assignments before ending their turn.

Weather is not a punishment — it is friction. It cannot be avoided by playing well, only planned around.

### Weather Types

| Type | Delay | Additional Effect | Affects |
|------|-------|-------------------|---------|
| Thunderstorm | +1 turn | Detection –5% at affected airport | Planes |
| Hurricane / Typhoon | +2 turns | Route temporarily closed for duration | Planes + ships in region |
| Port Fog | +1 turn | None | Ships at affected port |
| Blizzard | +1–2 turns | Checkpoint probability –10% | Trucks |
| Monsoon Season | +1 turn (rolling) | Affects entire region for 3–5 turns | All modes in region |

### Weather and Contracts

Weather interacts directly with deadlines. A 3-turn deadline contract with a storm sitting on the destination becomes a 4-turn job. The player decides before accepting whether to route around the weather (requires alternate open route), wait for it to clear, or accept the delay and risk missing the deadline.

Ships are most exposed — a 5-turn ocean route that hits 2 turns of port fog becomes a 7-turn delivery. Trucks have the most routing flexibility to avoid weather since domestic networks offer more path options.

### Seasonal Tendencies (visible to experienced players)

| Region | Season | Weather Type |
|--------|--------|-------------|
| Atlantic | Turns 10–20 | Hurricane probability increased |
| Pacific | Turns 8–18 | Typhoon corridors active |
| Northern routes | Turns 1–5, 25–30 | Blizzard probability increased |
| Southeast Asia | Turns 12–22 | Monsoon season active |

Seasons are fixed per run (not randomized) so players learn to anticipate them.

---

## Route Heat

Each city-pair route tracks heat independently from global heat.

| Level | Detection Bonus | Notes |
|-------|----------------|-------|
| 0 | +0% | Clean |
| 1 | +2% | Minor flag |
| 2 | +4% | Pattern detected |
| 3 | +6% | Under scrutiny |
| 4 | +8% | Active review |
| 5 | +10% | Surveillance — detection capped at 70% |

**Heat gain:** +1 each time an illicit shipment runs this route
**Heat decay:** –1 per turn the route carries no illicit cargo

---

## Contracts

Each turn the contract board refreshes. No transport mode is specified — the player chooses fulfillment. Some contracts roll over; some expire.

### Contract Fields

| Field | Description |
|-------|-------------|
| Origin | Departure city |
| Destination | Arrival city |
| Cargo type | Affects weight anomaly risk (illicit); flavor only (legit) |
| Volume | Units; must fit vehicle(s) assigned |
| Payout | Cash on delivery |
| Deadline | Turns to complete |
| Rep reward | Illicit contracts only |
| Risk level | LOW / MED / HIGH — based on route heat + destination scrutiny |

### Contract Board Composition

| Turn Range | Board |
|------------|-------|
| 1–5 | 4–5 legit, 1–2 illicit (domestic/regional only) |
| 6–12 | 4–5 legit, 2–3 illicit (some international) |
| 13+ | 4–6 legit, 3–4 illicit, 1 high-value illicit if rep ≥ 60 |

### Bidding

Some contracts have competing AI bidders. Player outbids at a premium or passes. Passing on illicit contracts repeatedly triggers rep decay (underworld sees you as unreliable).

### Deadline Failure

- Legit missed: cash penalty = 20% of contract value, rep –2
- Illicit missed: no cash penalty, rep –5

### Partial Delivery

If cargo is split across vehicles and one is busted, surviving vehicles deliver the remainder for proportional payout.

---

## Reputation System

| Event | Rep Change |
|-------|-----------|
| Complete illicit contract (low difficulty) | +5 |
| Complete illicit contract (medium difficulty) | +8 |
| Complete illicit contract (high difficulty) | +12–15 |
| Busted — truck | –5 |
| Busted — plane | –10 |
| Busted — ship | –15 |
| Miss illicit contract deadline | –5 |
| Contact cuts ties after bust in their city | –5 |
| Refuse illicit contracts 3+ turns in a row | –1/turn |
| No illicit activity for 3+ turns | –1/turn |

### Reputation Thresholds

| Rep | Effect |
|-----|--------|
| 0 | Lose |
| 30 | Mid-tier illicit contracts unlock |
| 60 | High-tier illicit contracts unlock; Underworld Broker available |
| 80 | Win condition met |

---

## Contacts

Contacts are tied to specific cities. Fee is paid every turn they are active. Lost contacts cannot be re-hired during the same run.

### Legit Contacts

| Contact | Benefit | Cost/Turn |
|---------|---------|-----------|
| Freight Broker | First look at contracts; +1 extra legit contract per turn | $300 |
| Port Agent | –1 turn on ship delivery at their port | $500 |
| Airline Partner | –20% plane maintenance at their hub | $400 |

### Illicit Contacts

| Contact | Benefit | Cost/Turn |
|---------|---------|-----------|
| Customs Insider | –15% detection at their airport; warns of sweeps 1 turn ahead | $800 |
| Port Fixer | Reveals port inspector schedule 2 turns ahead | $700 |
| Informant | Confirms Investigator location + next destination | $600 |
| Fence | Converts 40% of seized illicit cargo value into cash recovery | $500 |
| Underworld Broker | +1 high-value illicit contract per turn; requires rep ≥ 60 | $900 |

### Contact Loss

If the player is busted in a contact's city: 30% chance that contact cuts ties permanently.

---

## Map

The map is the primary interface. Global flight-tracker aesthetic.

### Visual Elements

- Dotted animated lines for active routes, color-coded by type
- Moving dots for in-transit vehicles
- City nodes (major hubs larger; minor cities smaller)
- Route heat shown via color intensity on route lines
- Unestablished routes shown as faint dashed lines (available to open)
- Piracy zones as shaded danger overlays on ocean lanes
- Weather zones as semi-transparent overlays with turn countdown
- Investigator marker at last known location
- Informant alert as pulsing marker on flagged cities
- Forecast indicators for incoming weather (1 turn preview)

### Route Colors

| Type | Color |
|------|-------|
| Air (legit) | Blue |
| Ship (legit) | Purple |
| Truck (legit) | Amber |
| Any illicit cargo | Red dashed |
| Unestablished (available) | Faint white dashed |
| Weather affected | Overlaid with storm icon + turn countdown |

---

## MVP Requirements

Minimum feature set for a playable first version.

### Core Loop
- [ ] Turn-based game loop with step-by-step resolution
- [ ] Fixed cost deduction each turn (maintenance + contacts)
- [ ] Cash, reputation, and heat meters tracked and displayed
- [ ] Win condition checks (net worth threshold OR rep threshold)
- [ ] Lose condition checks (cash ≤ 0 OR rep ≤ 0)

### Routes
- [ ] 4 pre-opened domestic routes at game start
- [ ] Route establishment: pay fee, skip 1 turn, route opens
- [ ] Cargo blocked from unestablished routes
- [ ] Legit route required before illicit layer can be activated
- [ ] Route tiers with tiered costs (domestic through long-haul)

### Fleet
- [ ] Truck available at start
- [ ] Plane and ship purchasable mid-game
- [ ] Vehicle assignment to contracts
- [ ] In-transit state with turn countdown
- [ ] Maintenance cost per vehicle per turn regardless of activity

### Map
- [ ] World map with city nodes
- [ ] Active route lines rendered between established city pairs
- [ ] Unestablished routes shown as faint available lines
- [ ] Vehicle dots animated along active routes
- [ ] Investigator marker at last known city
- [ ] Weather zone overlays with turn countdown

### Contracts
- [ ] Contract board with 4–6 legit + 2–3 illicit contracts per turn
- [ ] Contract fields: origin, destination, volume, payout, deadline, risk level
- [ ] Player assigns vehicle(s) to fulfill
- [ ] Delivery resolution: payout on success, penalty on failure
- [ ] Illicit contracts award rep on successful delivery
- [ ] Contracts requiring unopen route legs shown as unfulfillable until route is established

### Detection
- [ ] Base detection roll (5%) per illicit shipment on delivery
- [ ] Route heat modifier applied
- [ ] Global heat modifier applied
- [ ] Bust consequence: cargo seized, heat increase, rep decrease

### Weather
- [ ] 1–3 weather events generated per turn
- [ ] Forecast shown 1 turn before weather hits
- [ ] Delay applied automatically to vehicles on affected routes
- [ ] Weather zone visible on map with remaining turn count
- [ ] Hurricane/typhoon temporarily closes affected route

### Reputation
- [ ] Rep increases on illicit contract completion
- [ ] Rep decreases on bust
- [ ] Passive rep decay if no illicit activity for 3+ turns

---

## Post-MVP Features (V2+)

- Bidding mechanic against AI for contested contracts
- Full contacts system (all types)
- Investigator movement and tracking
- Piracy zones on ocean lanes
- Bribe mechanic at airports
- Split shipments across multiple vehicles with partial payout
- Port inspector schedule visibility
- Route heat visualization on map (color intensity)
- Fleet buy/sell mid-game
- Informant city alerts
- Highway checkpoint avoidance rerouting for trucks
- Seasonal weather tendencies by region
- Underworld Broker and high-tier illicit contracts
- Fence contact for partial cash recovery on busts

---

## Open Questions for V2

1. Does the contract board include competing AI bids, or is it always first-come-first-served?
2. Does cargo type affect vehicle eligibility on specific routes, or is it purely flavor?
3. Does the Investigator appear at a fixed turn (turn 8) or when player heat crosses a threshold?
4. Do piracy zones shift each run (roguelite variety) or stay fixed per session?
5. Should weather severity scale with turn number, or stay flat throughout the run?
