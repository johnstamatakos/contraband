export type SkillBranch = 'shadow' | 'logistics' | 'network'

export interface SkillDef {
  id: string
  branch: SkillBranch
  tier: 1 | 2 | 3
  name: string
  description: string   // full description shown in card
  effectSummary: string // short active-state label
}

export const SKILL_DEFS: SkillDef[] = [
  // ── Shadow branch ────────────────────────────────────────────────────────────
  {
    id: 'shadow_1',
    branch: 'shadow',
    tier: 1,
    name: 'Ghost Protocol',
    description: 'Operational security training reduces your baseline detection exposure.',
    effectSummary: '−10% detection chance',
  },
  {
    id: 'shadow_2',
    branch: 'shadow',
    tier: 2,
    name: 'Cover Your Tracks',
    description: 'After a bust, your crew eliminates the evidence trail faster. Routes stay flagged for 2 fewer weeks.',
    effectSummary: 'Flagged duration −2 weeks',
  },
  {
    id: 'shadow_3',
    branch: 'shadow',
    tier: 3,
    name: 'Counter-Intel',
    description: 'Disinformation campaigns reduce how effectively both the Inspector and Interpol can target your operations.',
    effectSummary: 'Inspector & Interpol detection bonus −50%',
  },

  // ── Logistics branch ─────────────────────────────────────────────────────────
  {
    id: 'logistics_1',
    branch: 'logistics',
    tier: 1,
    name: 'Fleet Efficiency',
    description: 'Streamlined maintenance contracts and bulk parts purchasing cuts your fleet overhead.',
    effectSummary: 'Maintenance costs −20%',
  },
  {
    id: 'logistics_2',
    branch: 'logistics',
    tier: 2,
    name: 'Express Routes',
    description: 'Optimised scheduling and priority handling gets your shipments moving faster.',
    effectSummary: 'All transit times −15%',
  },
  {
    id: 'logistics_3',
    branch: 'logistics',
    tier: 3,
    name: 'Cargo Premium',
    description: 'Your reputation for reliable delivery commands higher prices from buyers. Commodity sell prices are 20% higher on final delivery.',
    effectSummary: '+20% commodity sell price',
  },

  // ── Network branch ───────────────────────────────────────────────────────────
  {
    id: 'network_1',
    branch: 'network',
    tier: 1,
    name: 'Criminal Contacts',
    description: 'An expanded network of fixers and middlemen keeps a steady stream of work coming your way. 4 additional contracts are always available on the board.',
    effectSummary: '+4 contract board slots',
  },
  {
    id: 'network_2',
    branch: 'network',
    tier: 2,
    name: 'Street Intel',
    description: "Paid informants within law enforcement keep you ahead of threats. Inspector and Interpol positions are revealed on the map. Also includes a 40% chance to avoid vehicle impound on any bust.",
    effectSummary: 'Reveals threats on map · 40% impound avoidance',
  },
  {
    id: 'network_3',
    branch: 'network',
    tier: 3,
    name: 'Heat Sink',
    description: 'Bribes, misdirection, and planted evidence redirect law enforcement attention away from your operations.',
    effectSummary: 'Global heat decays +4/week',
  },
]

export const SKILL_BY_ID = new Map(SKILL_DEFS.map(s => [s.id, s]))
