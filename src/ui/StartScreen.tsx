import { useState, useEffect } from 'react'
import { useGameStore } from '../store/gameStore'

type Phase = 'hidden' | 'scanning' | 'content'

export function StartScreen() {
  const { hasStarted, startGame } = useGameStore()
  const [phase, setPhase] = useState<Phase>('hidden')

  useEffect(() => {
    if (hasStarted) return
    // Small delay so initial render settles before the transition fires
    const t1 = setTimeout(() => setPhase('scanning'), 80)
    // Content fades in after the wipe completes
    const t2 = setTimeout(() => setPhase('content'), 1200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [hasStarted])

  if (hasStarted) return null

  const scanning  = phase !== 'hidden'
  const showContent = phase === 'content'

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex items-center justify-center">
      <div className="max-w-lg w-full mx-6 space-y-7">

        {/* ── Logo with wipe effect ─────────────────────────── */}
        <div className="text-center">
          <div className="relative inline-block overflow-hidden">
            {/* Title text — revealed by clip-path */}
            <div
              className="font-black font-mono leading-none tracking-tighter text-6xl select-none"
              style={{
                clipPath: scanning ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
                transition: 'clip-path 1.05s cubic-bezier(0.77, 0, 0.175, 1)',
              }}
            >
              <span className="text-red-600">CONTRA</span>
              <span className="text-red-800 opacity-80"> // BAND</span>
            </div>

            {/* Scanner line — sweeps left → right in sync with the reveal */}
            <div
              className="pointer-events-none absolute inset-y-[-4px]"
              style={{
                left: scanning ? '100%' : '0%',
                width: '3px',
                background: 'linear-gradient(to bottom, transparent, #ef4444cc, #ef4444, #ef4444cc, transparent)',
                boxShadow: '0 0 12px 4px rgba(239,68,68,0.55)',
                opacity: showContent ? 0 : 1,
                transition: scanning && !showContent
                  ? 'left 1.05s cubic-bezier(0.77, 0, 0.175, 1)'
                  : 'opacity 0.25s ease',
              }}
            />
          </div>

          {/* Tagline fades in after the wipe */}
          <div
            className="text-gray-600 font-mono text-xs tracking-[0.3em] mt-2 uppercase"
            style={{ opacity: showContent ? 1 : 0, transition: 'opacity 0.5s ease 0.1s' }}
          >
            Global Logistics Operations
          </div>
        </div>

        {/* ── Everything below fades in together after the wipe ─ */}
        <div
          style={{ opacity: showContent ? 1 : 0, transition: 'opacity 0.5s ease 0.15s' }}
          className="space-y-7"
        >
          <div className="border-t border-gray-800" />

          {/* Hook */}
          <div className="space-y-2 font-mono text-sm text-gray-400 leading-relaxed">
            <p>
              You run a global cargo network — legitimate freight on the surface, contraband
              underneath. Expand your network, purchase illicit commodities, and smuggle them
              across multi-hop routes for profit and reputation.
            </p>
            <p>
              The clock runs in real time. <span className="text-gray-300">1 week = 2 minutes.</span> Pause anytime to plan your next move.
            </p>
          </div>

          {/* Core mechanics grid */}
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">

            <div className="bg-gray-900 border border-gray-800 rounded p-3 space-y-1.5">
              <div className="text-amber-400 font-bold uppercase tracking-widest">Routes</div>
              <div className="text-gray-400 leading-relaxed">
                Click a city to manage routes. <span className="text-gray-300">Establish connections</span> to expand your
                network and reach new commodity sources.
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded p-3 space-y-1.5">
              <div className="text-blue-400 font-bold uppercase tracking-widest">Supply Runs</div>
              <div className="text-gray-400 leading-relaxed">
                <span className="text-gray-300">Legit contracts loop automatically</span> — assign a vehicle once, collect
                steady income to fund your real operation.
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded p-3 space-y-1.5">
              <div className="text-amber-500 font-bold uppercase tracking-widest">Smuggling</div>
              <div className="text-gray-400 leading-relaxed">
                Buy commodities from <span className="text-gray-300">Black Market</span> in source cities. Plan multi-hop
                routes and deliver for <span className="text-gray-300">profit + reputation</span>.
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded p-3 space-y-1.5">
              <div className="text-emerald-400 font-bold uppercase tracking-widest">Win / Lose</div>
              <div className="text-gray-400 leading-relaxed">
                Reach <span className="text-gray-300">100 reputation</span> to win.
                Lose if you go bankrupt or your reputation is destroyed.
              </div>
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
    </div>
  )
}
