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
    name: 'Cold Trail',
    description: 'Your crews know how to go quiet. Route heat cools down faster after illicit runs.',
    effectSummary: 'Route heat decays +1/week',
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
    effectSummary: 'All transit times −10%',
  },
  {
    id: 'logistics_3',
    branch: 'logistics',
    tier: 3,
    name: 'Trade Deals',
    description: 'Established relationships with brokers and officials slash the cost of opening new corridors.',
    effectSummary: 'Route establishment −25%',
  },

  // ── Network branch ───────────────────────────────────────────────────────────
  {
    id: 'network_1',
    branch: 'network',
    tier: 1,
    name: 'Black Market Access',
    description: 'Word gets around. More illicit work finds its way onto your board.',
    effectSummary: '+1 illicit contract slot',
  },
  {
    id: 'network_2',
    branch: 'network',
    tier: 2,
    name: 'Street Intel',
    description: "Your street-level sources track the Inspector's and Interpol's movements and likely next stops.",
    effectSummary: "Reveals Inspector & Interpol next city",
  },
  {
    id: 'network_3',
    branch: 'network',
    tier: 3,
    name: 'Heat Sink',
    description: 'Bribes, misdirection, and planted evidence redirect law enforcement attention away from your operations.',
    effectSummary: 'Global heat decays +3/week',
  },
]

export const SKILL_BY_ID = new Map(SKILL_DEFS.map(s => [s.id, s]))
