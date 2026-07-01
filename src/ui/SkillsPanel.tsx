import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { SKILL_DEFS } from '../data/skills'
import type { SkillBranch } from '../data/skills'
import { CONFIG } from '../engine/config'
import { skillTierKey } from '../utils/gameHelpers'

const BRANCH_LABELS: Record<SkillBranch, string> = {
  shadow:    'Shadow',
  logistics: 'Logistics',
  network:   'Network',
}

const BRANCHES: SkillBranch[] = ['shadow', 'logistics', 'network']

export function SkillsPanel() {
  const [activeBranch, setActiveBranch] = useState<SkillBranch>('shadow')
  const unlockedSkills = useGameStore(s => s.gameState.unlockedSkills)
  const reputation = useGameStore(s => s.gameState.reputation)
  const cash = useGameStore(s => s.gameState.cash)
  const { unlockSkill } = useGameStore()

  const branchSkills = SKILL_DEFS
    .filter(s => s.branch === activeBranch)
    .sort((a, b) => a.tier - b.tier)

  const unlockedInBranch = branchSkills.filter(s => unlockedSkills.includes(s.id)).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Branch selector */}
      <div className="shrink-0 px-3 py-2 border-b border-gray-700">
        <div className="flex gap-1">
          {BRANCHES.map(branch => (
            <button
              key={branch}
              onClick={() => setActiveBranch(branch)}
              className={`flex-1 text-xs font-mono py-1 rounded transition-colors capitalize ${
                activeBranch === branch
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {BRANCH_LABELS[branch]}
            </button>
          ))}
        </div>
      </div>

      {/* Skill cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div>
          <div className="flex items-center justify-between px-2 py-1.5 rounded bg-gray-800 mb-2">
            <span className="text-xs font-mono font-semibold text-gray-300 uppercase tracking-wider">{BRANCH_LABELS[activeBranch]}</span>
            <span className="text-xs font-mono text-gray-500">{unlockedInBranch}/3</span>
          </div>
          <div className="space-y-1">
            {branchSkills.map((skill, idx) => {
              const isUnlocked = unlockedSkills.includes(skill.id)
              const repRequired = CONFIG.skills.tierRepRequirements[skillTierKey(skill.tier)]
              const cashCost = CONFIG.skills.tierCashCosts[skillTierKey(skill.tier)]
              const prereqMet = skill.tier === 1 || unlockedSkills.includes(`${skill.branch}_${skill.tier - 1}`)
              const repMet = reputation >= repRequired
              const canAfford = cash >= cashCost
              const isAvailable = prereqMet && repMet
              const canBuy = isAvailable && canAfford && !isUnlocked

              let cardBorder = 'border-gray-800'
              let labelColor = 'text-gray-500'
              if (isUnlocked) {
                cardBorder = 'border-green-800'
                labelColor = 'text-green-400'
              } else if (isAvailable) {
                cardBorder = 'border-amber-800'
                labelColor = 'text-amber-400'
              }

              return (
                <div key={skill.id}>
                  {/* Connector arrow between tiers */}
                  {idx > 0 && (
                    <div className="flex justify-center py-0.5">
                      <span className="text-gray-700 text-xs">↓</span>
                    </div>
                  )}

                  <div className={`border rounded p-3 bg-gray-950 ${cardBorder}`}>
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        {!isUnlocked && !isAvailable && (
                          <span className="text-gray-600 text-xs">🔒</span>
                        )}
                        <span className={`text-xs font-mono font-semibold uppercase tracking-wide ${labelColor}`}>
                          {skill.name}
                        </span>
                      </div>
                      {isUnlocked && (
                        <span className="text-xs font-mono text-green-500 bg-green-950 border border-green-800 px-1.5 py-0.5 rounded">
                          ACTIVE
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className={`text-xs font-mono mb-2 leading-relaxed ${isUnlocked ? 'text-gray-400' : 'text-gray-600'}`}>
                      {isUnlocked ? skill.effectSummary : skill.description}
                    </p>

                    {/* Footer: requirements or action */}
                    {!isUnlocked && (
                      <div className="space-y-1.5">
                        {/* Requirements */}
                        {(!prereqMet || !repMet) && (
                          <div className="text-xs font-mono text-gray-700 space-y-0.5">
                            {!prereqMet && (
                              <div>Requires Tier {skill.tier - 1} first</div>
                            )}
                            {!repMet && (
                              <div className="text-red-900">Rep {repRequired} required (you have {reputation})</div>
                            )}
                          </div>
                        )}

                        {/* Unlock button */}
                        {isAvailable && (
                          <button
                            onClick={() => unlockSkill(skill.id)}
                            disabled={!canBuy}
                            className={`w-full py-1.5 text-xs font-mono rounded border transition-colors ${
                              canBuy
                                ? 'bg-amber-950 border-amber-700 text-amber-300 hover:bg-amber-900 hover:border-amber-600'
                                : 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
                            }`}
                          >
                            Unlock — <span className={canAfford ? 'text-emerald-400' : 'text-red-500'}>
                              ${cashCost.toLocaleString()}
                            </span>
                            {!canAfford && (
                              <span className="text-gray-600 ml-1">(need ${(cashCost - cash).toLocaleString()} more)</span>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
