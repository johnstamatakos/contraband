import { useGameStore } from './store/gameStore'
import { HUD } from './ui/HUD'
import { WeeklyReport } from './ui/WeeklyReport'
import { FleetPanel } from './ui/FleetPanel'
import { ContractBoard } from './ui/ContractBoard'
import { SkillsPanel } from './ui/SkillsPanel'
import { GameOver } from './ui/GameOver'
import { StartScreen } from './ui/StartScreen'
import { MapView } from './map/MapView'
import { EventFeed } from './ui/EventFeed'
import { useGameClock } from './hooks/useGameClock'
import { useState } from 'react'

function NewGameButton() {
  const { newGame } = useGameStore()
  return (
    <button
      onClick={newGame}
      className="w-full py-1.5 text-xs font-mono text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-600 rounded transition-colors"
    >
      Restart
    </button>
  )
}

function TestModeButton() {
  const testMode = useGameStore(s => s.testMode)
  const handleClick = () => {
    useGameStore.setState(s => ({
      testMode: true,
      gameState: { ...s.gameState, cash: s.gameState.cash + 50_000, reputation: 60 },
    }))
  }
  return (
    <button
      onClick={handleClick}
      className={`fixed bottom-4 left-4 z-50 px-3 py-1.5 text-xs font-mono border rounded transition-colors ${
        testMode
          ? 'bg-yellow-700 border-yellow-500 text-yellow-200'
          : 'bg-yellow-900 hover:bg-yellow-800 text-yellow-300 border-yellow-700'
      }`}
    >
      {testMode ? 'TEST MODE ON' : 'TEST +$50K'}
    </button>
  )
}

type SidebarTab = 'contracts' | 'fleet' | 'skills'

export function App() {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('contracts')
  const { gameTimeMsRef, displayTimeMs } = useGameClock()

  return (
    <div className="h-screen overflow-hidden bg-gray-950 text-white flex flex-col">
      {/* Top HUD */}
      <HUD displayTimeMs={displayTimeMs} />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: Contracts / Fleet tabs */}
        <div className="w-96 shrink-0 border-r border-gray-700 flex flex-col bg-gray-900">
          {/* Tab bar */}
          <div className="flex border-b border-gray-700">
            {(['contracts', 'fleet', 'skills'] as SidebarTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={`flex-1 text-xs font-mono uppercase tracking-widest py-2.5 transition-colors ${
                  sidebarTab === tab
                    ? 'bg-gray-800 text-white border-b-2 border-amber-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {sidebarTab === 'contracts' ? <ContractBoard /> : sidebarTab === 'fleet' ? <FleetPanel /> : <SkillsPanel />}
          </div>

          <div className="p-3 border-t border-gray-700">
            <NewGameButton />
          </div>
        </div>

        {/* Main area: Pixi.js map + event feed overlay */}
        <div className="relative flex-1 overflow-hidden flex">
          <MapView gameTimeMsRef={gameTimeMsRef} />
          <EventFeed />
        </div>
      </div>

      {/* Weekly report (pauses game while open) */}
      <WeeklyReport />

      {/* Game over overlay */}
      <GameOver />

      {/* Start screen (shown before first game start) */}
      <StartScreen />

      {/* Temporary test button */}
      <TestModeButton />
    </div>
  )
}
