/**
 * Central game configuration.
 *
 * All numeric tuning lives here. Import CONFIG wherever you need a tunable
 * value — never hardcode magic numbers in engine files.
 *
 * Values are mutable at runtime, so you can tweak them from the browser
 * console: e.g. `CONFIG.weather.spawnChancePerWeek = 0.5`
 */
export const CONFIG = {

  // ── Player starting state ───────────────────────────────────────────────────
  start: {
    cash:        15_000,
    reputation:  10,
    globalHeat:  0,
  },

  // ── Win / lose thresholds ───────────────────────────────────────────────────
  winLose: {
    netWorthGoal:        2_000_000,  // cash + fleet resale value to win
    reputationWinAt:     100,      // max reputation to trigger rep-win
    // Lose conditions: cash <= 0  OR  reputation <= 0  (no threshold to configure)
  },

  // ── Inspector (domestic / regional) ────────────────────────────────────────
  inspector: {
    appearsOnTurn: 10,   // early-mid game deterrent on domestic/regional illicit
  },

  // ── Interpol (international / long-haul) ────────────────────────────────────
  interpol: {
    appearsOnTurn: 20,   // late-game; forces player to plan around international illicit
  },

  // ── Vehicles ────────────────────────────────────────────────────────────────
  vehicles: {
    truck: {
      purchasePrice:      20_000,   // domestic/regional workhorse; affordable entry point
      maintenancePerTurn: 275,
      capacity:           20,
      speedMin:           1,
      speedMax:           3,
      resaleValue:        12_000,
    },
    plane: {
      purchasePrice:      150_000,  // fast (1–3 wks), airport-only; premium for international illicit
      maintenancePerTurn: 1_500,
      capacity:           50,
      speedMin:           1,
      speedMax:           3,
      resaleValue:        90_000,
    },
    ship: {
      purchasePrice:      80_000,   // high-volume long-haul; slower but massive capacity
      maintenancePerTurn: 650,
      capacity:           150,
      speedMin:           3,
      speedMax:           10,
      resaleValue:        48_000,
    },
  },

  // ── Route costs & unlock requirements ───────────────────────────────────────
  routes: {
    costs: {
      domestic:      { establish: 1_000,  illicit: 500   },
      regional:      { establish: 3_000,  illicit: 1_500 },
      international: { establish: 10_000, illicit: 5_000 },
      long_haul:     { establish: 20_000, illicit: 10_000 },
    },
    // Minimum reputation required to establish a route of each tier
    repRequirements: {
      domestic:      0,
      regional:      0,
      international: 35,
      long_haul:     55,
    },
    // Game-days to wait before a newly established route opens
    pendingDays: {
      domestic:      2,
      regional:      4,
      international: 7,
      long_haul:     14,
    },
  },

  // ── Lay Low (manual heat reduction) ──────────────────────────────────────────
  layLow: {
    cost:           5_000,  // cash cost per use
    heatReduction:  15,     // globalHeat reduced
    cooldownWeeks:  2,      // minimum weeks between uses
  },

  // ── Contract board ──────────────────────────────────────────────────────────
  contracts: {
    boardSize:    12,  // target number of unassigned contracts on the board
    minLegit:     3,   // floor: always keep at least this many legit contracts
    maxPerRoute:  2,   // max contracts for any single route pair on the board
    maxPerCity:   2,   // max contracts involving the same city on the board

    commodityMatchBonus: 1.25,  // +25% payout when cargo matches city export→import flow
    illicitMaxPerRoute: 1,     // max illicit contracts per route pair on the board

    // Multi-leg contracts
    multiLeg: {
      minTierRank:          0,     // any tier can spawn multi-leg
      twoLegChance:         0.20,  // 20% chance for 2-leg upgrade
      threeLegChance:       0.10,  // 10% chance to extend 2-leg to 3-leg
      twoLegPayoutMult:     1.65,
      threeLegPayoutMult:   2.20,
      extraDeadlineDays:    2,     // extra weeks per additional leg
    },

    deadlineMin:  3,   // minimum weeks to complete a contract
    deadlineMax:  5,   // maximum weeks to complete a contract

    // Cash payout per unit of cargo
    payoutPerUnit: {
      domestic:      { legit: 50,  illicit: 150 },
      regional:      { legit: 90,  illicit: 260 },
      international: { legit: 160, illicit: 420 },
      long_haul:     { legit: 280, illicit: 700 },
    },

    // Volume (units) generated per contract
    volumeRange: {
      domestic:      { min: 5,  max: 18  },
      regional:      { min: 8,  max: 32  },
      international: { min: 15, max: 45  },
      long_haul:     { min: 40, max: 120 },
    },

    // Rep reward for completing an illicit contract
    illicitRepReward: {
      domestic:      2,
      regional:      3,
      international: 4,
      long_haul:     6,
    },

    // Late-game high-value bonus contract (2× volume multiplier)
    highValueBonus: {
      enabledFromTurn:     13,
      reputationRequired:  60,
      volumeMultiplier:    2,
    },

    // Recurring supply-run contracts (auto-redispatch indefinitely until interrupted)
    recurring: {
      // All legit contracts are recurring supply runs — no one-shot legit jobs
      legitSpawnChance: {
        domestic:      1.0,
        regional:      1.0,
        international: 1.0,
        long_haul:     1.0,
      },
      illicitSpawnChance: 0,   // no illicit recurring — they're one-shot decisions

      // 999 = indefinite sentinel; vehicle loops until busted or piracy
      runs: {
        domestic:      { min: 999, max: 999 },
        regional:      { min: 999, max: 999 },
        international: { min: 999, max: 999 },
        long_haul:     { min: 999, max: 999 },
      },

      payoutMultiplier: 0.65,  // legit recurring pays 35% less — incentivise illicit for winning
    },
  },

  // ── Detection probability ───────────────────────────────────────────────────
  detection: {
    baseChance:              0.12,  // flat base probability — high enough that upgrades reduce but never eliminate risk
    perRouteHeat:            0.08,  // added per route-heat point (scale 0–5)
    perGlobalHeatPoint:      0.002, // added per global-heat point (scale 0–100)
    perConsecutiveRun:       0.04,  // added per consecutive illicit run on this route
    maxConsecutiveRuns:      5,     // consecutive-run bonus caps here
    minProbability:          0.03,  // hard floor — running contraband is never truly safe
    // Inspector: domestic/regional routes only
    inspectorBonus:          0.25,  // +25% when inspector is at origin or destination
    // Interpol: international/long_haul routes only
    interpolBonus:           0.45,  // +45% when Interpol is directly at origin/destination
    interpolAdjacentBonus:   0.15,  // +15% when Interpol is 1 hop away on the intl graph
    maxProbability:          0.80,  // hard ceiling on detection chance
    // Legit cover: each active recurring legit shipment in transit lowers detection
    perLegitRecurring:       0.01,  // reduction per active legit recurring shipment
    maxLegitRecurringBonus:  0.08,  // hard cap on total cover reduction (8 contracts)
  },

  // ── Economy (bust & success consequences, weekly decay) ─────────────────────
  economy: {
    // Inspector bust consequences (domestic / regional routes)
    bustRepLoss:        8,
    bustGlobalHeatGain: 10,
    bustRouteHeatGain:  3,   // +3 heat per bust; decays back in ~3 weeks
    bustFlaggedWeeks:   4,   // 4-week lockout outlasts most contract deadlines

    // Interpol bust consequences (international / long_haul routes) — much harsher
    interpolBustRepLoss:        15,
    interpolBustGlobalHeatGain: 22,
    interpolBustRouteHeatGain:  4,   // +4 heat per bust
    interpolBustFlaggedWeeks:   6,   // 6-week lockout on international routes

    // Successful illicit delivery
    successGlobalHeatGain: 5,

    // Weekly decay
    globalHeatDecayPerWeek:    2,   // globalHeat reduced by this each weekly tick
    repDecayThresholdWeeks:    3,   // weeks without illicit activity before rep starts dropping
    repDecayPerWeek:           2,   // rep lost each week after the threshold

    // Ship piracy (international / long_haul routes only — affects ALL ships, legit or illicit)
    piracyChance:          0.04,   // 4% per ship per international/long_haul arrival; mitigated by concealment
    piracyRansomFraction:  0.55,   // ransom as fraction of vessel purchase price (~$44K for a ship)
    piracyRepLoss:         3,      // reputation lost — lighter hit since pirates aren't law enforcement
    piracyGlobalHeatGain:  8,      // global heat gained per piracy event
    piracyImpoundWeeks:    4,      // 4 weeks to pay ransom before permanent loss

    // Inspector impound on bust (Interpol busts seize the vehicle permanently — no fine)
    impoundFineMultiplier: 0.40,  // Inspector: 40% of vehicle purchase price
    impoundRecoveryWeeks:  3,
  },

  // ── Vehicle upgrades ────────────────────────────────────────────────────────
  vehicleUpgrades: {
    // Cost as a fraction of the vehicle's purchase price
    tier1CostFraction: 0.50,   // T1 = 50% of purchase price
    tier2CostFraction: 1.00,   // T2 = 100% of purchase price

    effects: {
      cargo: {
        tier1PayoutBonus: 0.20,         // +20% payout on delivery
        tier2PayoutBonus: 0.40,         // +40% payout on delivery
      },
      engine: {
        tier1TransitMultiplier: 0.90,   // −10% transit time
        tier2TransitMultiplier: 0.80,   // −20% transit time
      },
      concealment: {
        tier1DetectionReduction: 0.05,  // −5% detection chance
        tier2DetectionReduction: 0.12,  // −12% detection chance
        tier1PiracyMitigation:   0.30,  // −30% piracy chance on ships
        tier2PiracyMitigation:   0.60,  // −60% piracy chance on ships
      },
      range: {
        // T1: unlocks international contracts; T2: unlocks long_haul contracts
        // (gates are enforced by vehicleRequirements on generated contracts)
        tier1PayoutBonus: 0.0,   // range itself gives no payout bonus — it's a capability gate
        tier2PayoutBonus: 0.0,
      },
    },
  },

  // ── Skill tree ──────────────────────────────────────────────────────────────
  skills: {
    // Minimum reputation required to purchase each tier
    tierRepRequirements: {
      tier1: 0,   // available from start — cash only
      tier2: 25,
      tier3: 50,
    },
    // One-time cash cost per tier
    tierCashCosts: {
      tier1: 15_000,
      tier2: 40_000,
      tier3: 80_000,
    },
    // Per-skill effect magnitudes — tune these without touching engine files
    effects: {
      shadow_1:    { detectionReduction: 0.05 },          // Ghost Protocol: flat detection reduction
      shadow_2:    { flaggedDurationReduction: 2 },          // Cover Your Tracks: weeks cut from flagged lockout after bust
      shadow_3:    { threatBonusMultiplier: 0.50 },         // Counter-Intel: fraction of Inspector/Interpol bonus kept
      logistics_1: { maintenanceMultiplier: 0.80 },         // Fleet Efficiency: fraction of base maintenance paid
      logistics_2: { transitTimeMultiplier: 0.90 },         // Express Routes: fraction of base transit time
      logistics_3: { illicitPayoutBonus: 0.25 },            // Premium Cargo: bonus multiplier on illicit delivery payout
      network_1:   { illicitContractBonus: 2 },             // Black Market Access: extra illicit contract slots
      network_2:   { impoundAvoidChance: 0.40 },            // Connections: chance to avoid vehicle impound on Inspector bust
      network_3:   { globalHeatExtraDecay: 3 },            // Heat Sink: extra global heat removed per week
    },
  },

  // ── Rival operation (competitor sabotage) ───────────────────────────────────
  rival: {
    appearsOnTurn:       15,   // grace period — no rival threats in early game
    chancePerWeek:       0.06, // 6% per week; expected once every ~17 weeks
    ransomFraction:      0.30, // 30% of vehicle purchase price to recover
    impoundWeeks:        3,    // 3-week window before vehicle is permanently lost
    informantMitigation: 0.50, // Informant contact halves the chance
  },

  // ── Weather ─────────────────────────────────────────────────────────────────
  weather: {
    spawnChancePerWeek:  0.15,  // probability a new weather event is generated each week
    maxConcurrentEvents: 2,     // storms above this count are suppressed
    multiRouteChance:    0.40,  // probability a storm hits 2 routes instead of 1
    activeDurationDays:  5,     // game-days a storm blocks routes once active
  },

  // ── UI ──────────────────────────────────────────────────────────────────────
  ui: {
    eventFeedCap:      50,  // max live events kept in state.events
    meterWarnAt:       30,  // heat/rep value where meter turns yellow
    meterCritAt:       60,  // heat/rep value where meter turns red
  },

  // ── Engine ──────────────────────────────────────────────────────────────────
  engine: {
    rafDeltaCapMs: 200,  // max ms a single rAF tick is allowed to advance game time
  },

}
