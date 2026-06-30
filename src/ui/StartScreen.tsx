import { useGameStore } from '../store/gameStore'

export function StartScreen() {
  const { hasStarted, startGame } = useGameStore()
  if (hasStarted) return null

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/95 flex items-center justify-center">
      <div className="max-w-lg w-full mx-6 space-y-8">

        {/* Logo */}
        <div className="text-center">
          <div className="font-black font-mono leading-none tracking-tighter mb-1 text-6xl">
            <span className="text-red-600">CONTRA</span>
            <span className="text-red-700 opacity-70"> // BAND</span>
          </div>
          <div className="text-gray-600 font-mono text-xs tracking-[0.3em] mt-2 uppercase">
            Global Logistics Operations
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-800" />

        {/* Brief intro */}
        <div className="space-y-3 font-mono text-sm text-gray-400 leading-relaxed">
          <p>
            You run a global cargo operation — legitimate freight on the surface,
            contraband underneath. Establish routes, assign vehicles, avoid detection.
          </p>
          <p>
            The clock runs in real time. <span className="text-gray-300">1 week = 2 minutes.</span> Pause anytime to plan your moves.
          </p>
        </div>

        {/* Quick rules */}
        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          <div className="bg-gray-900 border border-gray-800 rounded p-3 space-y-1.5">
            <div className="text-amber-400 font-bold uppercase tracking-widest text-xs">Routes</div>
            <div className="text-gray-400">Click a city on the map to establish routes. Costs cash, opens in 1 day.</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded p-3 space-y-1.5">
            <div className="text-blue-400 font-bold uppercase tracking-widest text-xs">Contracts</div>
            <div className="text-gray-400">Assign idle vehicles to contracts in the sidebar. Legit builds cash, illicit builds rep.</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded p-3 space-y-1.5">
            <div className="text-red-400 font-bold uppercase tracking-widest text-xs">Heat</div>
            <div className="text-gray-400">Repeated illicit runs raise route heat. The investigator appears at week 8.</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded p-3 space-y-1.5">
            <div className="text-emerald-400 font-bold uppercase tracking-widest text-xs">Win</div>
            <div className="text-gray-400">Reach $100K net worth or 80 reputation before going bankrupt or losing all rep.</div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={startGame}
          className="w-full py-4 bg-red-700 hover:bg-red-600 active:bg-red-800 text-white font-black font-mono text-lg tracking-widest uppercase rounded transition-colors"
        >
          Begin Operation
        </button>
      </div>
    </div>
  )
}
