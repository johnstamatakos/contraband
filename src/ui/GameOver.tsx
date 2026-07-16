import { useGameStore } from '../store/gameStore'
import { getNetWorth } from '../engine/gameState'

const WIN_STATE_MESSAGES: Record<string, { title: string; subtitle: string; color: string }> = {
  win_reputation: {
    title: 'YOU WIN',
    subtitle: 'Reputation at 100. You are a legend in the underworld.',
    color: 'text-blue-400',
  },
  lose_bankrupt: {
    title: 'GAME OVER',
    subtitle: 'Bankrupt. The operation collapsed under its own weight.',
    color: 'text-red-400',
  },
  lose_reputation: {
    title: 'GAME OVER',
    subtitle: 'Reputation destroyed. No one will work with you anymore.',
    color: 'text-red-400',
  },
}

export function GameOver() {
  const { gameState, newGame } = useGameStore()
  const { winState, turn, cash, reputation, globalHeat } = gameState

  if (!winState) return null

  const msg = WIN_STATE_MESSAGES[winState] ?? WIN_STATE_MESSAGES.lose_bankrupt!
  const nw = getNetWorth(gameState)
  const isWin = winState.startsWith('win')

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 max-w-md w-full mx-4">
        <div className={`text-4xl font-black font-mono tracking-widest mb-2 ${msg.color}`}>
          {msg.title}
        </div>
        <div className="text-gray-400 font-mono text-sm mb-6">{msg.subtitle}</div>

        <div className="space-y-2 mb-8 font-mono text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Time played</span>
            <span className="text-white">{turn - 1} week{turn - 1 !== 1 ? 's' : ''} ({(turn - 1) * 7} days)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Final cash</span>
            <span className="text-emerald-400">${cash.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Net worth</span>
            <span className="text-yellow-400">${nw.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Reputation</span>
            <span className={reputation >= 60 ? 'text-blue-400' : 'text-red-400'}>{reputation}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Global heat</span>
            <span className={globalHeat >= 50 ? 'text-red-400' : 'text-orange-400'}>{globalHeat}</span>
          </div>
        </div>

        <button
          onClick={newGame}
          className={`w-full py-3 rounded font-mono font-bold text-sm tracking-widest uppercase transition-colors ${
            isWin
              ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
              : 'bg-red-700 hover:bg-red-600 text-white'
          }`}
        >
          Play Again
        </button>
      </div>
    </div>
  )
}
