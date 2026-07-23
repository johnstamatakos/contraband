import type { GameState } from '../engine/gameState'
import { CONFIG } from '../engine/config'
import { SKILL_BY_ID } from '../data/skills'
import { currentGameTimeMs } from './gameStore'
import { bumpStats } from './statsHelpers'

export function createSkillActions(
  get: () => { gameState: GameState },
  set: (updater: { gameState: GameState }) => void,
) {
  return {
    payDownHeat: () => {
      const { gameState } = get()
      const { costTiers, heatReduction, cooldownWeeks } = CONFIG.layLow
      const cost = costTiers.find(t => gameState.reputation >= t.minRep)!.cost
      if (gameState.cash < cost) return
      if (gameState.globalHeat <= 0) return
      if (gameState.turn - (gameState.lastLayLowTurn ?? 0) < cooldownWeeks) return

      const newHeat = Math.max(0, gameState.globalHeat - heatReduction)
      const newEvent = {
        id: `e_laylow_${currentGameTimeMs}`, gameTimeMs: currentGameTimeMs,
        message: `Laying low — heat reduced by ${gameState.globalHeat - newHeat}. -$${cost.toLocaleString()}`,
        type: 'info' as const,
      }

      set({
        gameState: {
          ...gameState,
          cash: gameState.cash - cost,
          globalHeat: newHeat,
          lastLayLowTurn: gameState.turn,
          events: [...gameState.events, newEvent].slice(-50),
          weeklyStats: {
            ...gameState.weeklyStats,
            expenseBreakdown: {
              ...gameState.weeklyStats.expenseBreakdown,
              'Lay Low': (gameState.weeklyStats.expenseBreakdown['Lay Low'] ?? 0) + cost,
            },
          },
          lifetimeStats: bumpStats(gameState.lifetimeStats, { totalMoneySpent: cost }),
        },
      })
    },

    unlockSkill: (skillId: string) => {
      const { gameState } = get()
      const skill = SKILL_BY_ID.get(skillId)
      if (!skill) return
      if (gameState.unlockedSkills.includes(skillId)) return

      const repRequired = CONFIG.skills.tierRepRequirements[`tier${skill.tier}` as 'tier1' | 'tier2' | 'tier3']
      if (gameState.reputation < repRequired) return

      if (skill.tier > 1) {
        const prereqId = `${skill.branch}_${skill.tier - 1}`
        if (!gameState.unlockedSkills.includes(prereqId)) return
      }

      const cost = CONFIG.skills.tierCashCosts[`tier${skill.tier}` as 'tier1' | 'tier2' | 'tier3']
      if (gameState.cash < cost) return

      const newEvent = {
        id: `e_skill_${skillId}_${currentGameTimeMs}`, gameTimeMs: currentGameTimeMs,
        message: `Skill unlocked: ${skill.name}`,
        type: 'success' as const,
      }

      const revealsThreats = skillId === 'network_2'

      set({
        gameState: {
          ...gameState,
          cash: gameState.cash - cost,
          unlockedSkills: [...gameState.unlockedSkills, skillId],
          inspector: revealsThreats ? { ...gameState.inspector, isTrackedByInformant: true } : gameState.inspector,
          interpol: revealsThreats ? { ...gameState.interpol, isTrackedByInformant: true } : gameState.interpol,
          events: [...gameState.events, newEvent].slice(-50),
          weeklyStats: {
            ...gameState.weeklyStats,
            expenseBreakdown: {
              ...gameState.weeklyStats.expenseBreakdown,
              'Skills': (gameState.weeklyStats.expenseBreakdown['Skills'] ?? 0) + cost,
            },
          },
          lifetimeStats: bumpStats(gameState.lifetimeStats, { totalMoneySpent: cost, skillsUnlocked: 1 }),
        },
      })
    },
  }
}
