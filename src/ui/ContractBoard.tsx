import { useState, useEffect } from 'react'
import { useGameStore, currentGameTimeMs } from '../store/gameStore'
import type { Contract } from '../engine/gameState'
import { ContractModal } from './ContractModal'
import { AvailableCard } from './AvailableCard'
import { InTransitCard } from './InTransitCard'
import { SmuggleRunCard } from './SmuggleRunCard'

type SubNav = 'available' | 'in-transit'

export function ContractBoard() {
  const { gameState, declineContract } = useGameStore()
  const [subNav, setSubNav]   = useState<SubNav>('available')
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [now, setNow]         = useState(currentGameTimeMs)

  useEffect(() => {
    const id = setInterval(() => setNow(currentGameTimeMs), 500)
    return () => clearInterval(id)
  }, [])

  const allContracts = gameState.contracts
  const inTransit    = allContracts.filter(c => c.isAssigned)
  const available = allContracts.filter(c => !c.isAssigned)
  const activeSmuggleRuns = gameState.smuggleRuns.filter(r => r.status === 'in_transit')
  const recentSmuggleRuns = gameState.smuggleRuns.filter(r =>
    r.status !== 'in_transit' && r.completedAtTurn !== null &&
    gameState.turn - r.completedAtTurn! < 3,
  )
  const smuggleRuns = [...activeSmuggleRuns, ...recentSmuggleRuns]
  const inTransitCount = inTransit.length + activeSmuggleRuns.length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex shrink-0 border-b border-gray-700">
        {(['available', 'in-transit'] as SubNav[]).map(nav => {
          const count = nav === 'available' ? available.length : inTransitCount
          return (
            <button
              key={nav}
              onClick={() => setSubNav(nav)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono tracking-wide transition-colors ${
                subNav === nav ? 'text-white border-b-2 border-amber-500' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {nav === 'available' ? 'Supply Contracts' : 'In Transit'}
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded-full ${
                subNav === nav ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-600'
              }`}>{count}</span>
              {nav === 'in-transit' && inTransitCount > 0 && subNav !== 'in-transit' && (
                <span className="absolute top-2 right-3 w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>
          )
        })}
      </div>

      {subNav === 'available' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {available.length === 0 ? (
              <p className="text-xs font-mono text-gray-700 text-center py-6">
                No contracts available. Check back after the weekly refresh.
              </p>
            ) : (
              available.map(c => (
                <AvailableCard key={c.id} contract={c}
                  onOpen={() => setSelectedContract(c)}
                  onDecline={() => declineContract(c.id)} />
              ))
            )}
          </div>
        </div>
      )}

      {subNav === 'in-transit' && (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {inTransit.length === 0 && smuggleRuns.length === 0 ? (
            <p className="text-xs font-mono text-gray-700 text-center py-6">No active shipments.</p>
          ) : (
            <>
              {smuggleRuns.map(r => <SmuggleRunCard key={r.id} run={r} now={now} />)}
              {inTransit.map(c => (
                <InTransitCard key={c.id} contract={c} now={now}
                  onOpen={() => setSelectedContract(c)} />
              ))}
            </>
          )}
        </div>
      )}

      {selectedContract && (
        <ContractModal contract={selectedContract} onClose={() => setSelectedContract(null)} />
      )}
    </div>
  )
}
