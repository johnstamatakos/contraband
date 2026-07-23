import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { FleetPanel } from './FleetPanel'
import { ContractBoard } from './ContractBoard'
import { SkillsPanel } from './SkillsPanel'
import { MarketModal } from './MarketModal'
import { StatsModal } from './StatsModal'
import { LedgerModal } from './LedgerModal'
import { CONFIG } from '../engine/config'

type Tab = 'map' | 'fleet' | 'contracts' | 'skills' | 'more'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'map',       label: 'Map',       icon: '🗺' },
  { id: 'fleet',     label: 'Fleet',     icon: '🚚' },
  { id: 'contracts', label: 'Ops',       icon: '📋' },
  { id: 'skills',    label: 'Skills',    icon: '⚡' },
  { id: 'more',      label: 'More',      icon: '⋯' },
]

export function MobileNav({ onNewGame }: { onNewGame: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('map')
  const [showMarket, setShowMarket] = useState(false)
  const [showStats, setShowStats]   = useState(false)
  const [showLedger, setShowLedger] = useState(false)

  const { gameState, payDownHeat } = useGameStore()
  const { cash, reputation, turn, lastLayLowTurn, globalHeat } = gameState
  const hasImpoundedVehicles = gameState.fleet.some(v => v.isImpounded)

  const layLowCost = CONFIG.layLow.costTiers.find(t => reputation >= t.minRep)!.cost
  const canLayLow = cash >= layLowCost && globalHeat > 0 &&
    turn - (lastLayLowTurn ?? 0) >= CONFIG.layLow.cooldownWeeks

  const sheetOpen = activeTab !== 'map'

  return (
    <>
      {/* Bottom sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-x-0 bottom-14 z-30 flex flex-col bg-gray-900 border-t border-gray-700 rounded-t-2xl shadow-2xl"
          style={{ top: '30%' }}
        >
          {/* Drag handle */}
          <div
            className="flex justify-center pt-2.5 pb-1 shrink-0 cursor-pointer"
            onClick={() => setActiveTab('map')}
          >
            <div className="w-10 h-1 rounded-full bg-gray-600" />
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'fleet'     && <FleetPanel />}
            {activeTab === 'contracts' && <ContractBoard />}
            {activeTab === 'skills'    && <SkillsPanel />}
            {activeTab === 'more'      && (
              <div className="p-5 flex flex-col gap-3">
                <div className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-widest mb-1">Actions</div>

                {/* Lay Low */}
                <div className="relative group">
                  <button
                    onClick={payDownHeat}
                    disabled={!canLayLow}
                    className={`w-full text-sm font-mono px-4 py-3 rounded-lg border transition-colors ${
                      canLayLow
                        ? 'bg-gray-800 hover:bg-gray-700 text-orange-400 border-gray-700'
                        : 'bg-gray-900 text-gray-700 border-gray-800 cursor-not-allowed'
                    }`}
                  >
                    Lay Low — ${layLowCost.toLocaleString()}
                  </button>
                  <div className="text-xs font-mono text-gray-600 mt-1 pl-1">
                    -{CONFIG.layLow.heatReduction} heat · {CONFIG.layLow.cooldownWeeks}w cooldown
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-1">
                  <button
                    onClick={() => setShowMarket(true)}
                    className="py-3 rounded-lg border bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-mono border-gray-700 transition-colors"
                  >
                    Market
                  </button>
                  <button
                    onClick={() => setShowStats(true)}
                    className="py-3 rounded-lg border bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-mono border-gray-700 transition-colors"
                  >
                    Stats
                  </button>
                  <button
                    onClick={() => setShowLedger(true)}
                    className="py-3 rounded-lg border bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-mono border-gray-700 transition-colors"
                  >
                    Ledger
                  </button>
                </div>

                <div className="mt-auto pt-4 border-t border-gray-800">
                  <button
                    onClick={onNewGame}
                    className="w-full py-2.5 text-xs font-mono text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-600 rounded-lg transition-colors"
                  >
                    Restart Game
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 flex bg-gray-900 border-t border-gray-700 safe-area-inset-bottom">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          const hasBadge = tab.id === 'fleet' && hasImpoundedVehicles
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                isActive ? 'text-amber-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="text-[10px] font-mono">{tab.label}</span>
              {hasBadge && (
                <span className="absolute top-1.5 right-[calc(50%-14px)] w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
              {isActive && (
                <span className="absolute top-0 inset-x-2 h-0.5 rounded-full bg-amber-500" />
              )}
            </button>
          )
        })}
      </div>

      {/* Modals */}
      {showMarket && <MarketModal onClose={() => setShowMarket(false)} />}
      {showStats  && <StatsModal  onClose={() => setShowStats(false)}  />}
      {showLedger && <LedgerModal onClose={() => setShowLedger(false)} />}
    </>
  )
}
