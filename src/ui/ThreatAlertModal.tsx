import { useGameStore } from '../store/gameStore'
import { VEHICLE_ICON } from './vehicleConstants'

export function ThreatAlertModal() {
  const threatAlerts    = useGameStore(s => s.threatAlerts)
  const dismissAlert    = useGameStore(s => s.dismissThreatAlert)
  const payImpoundFine  = useGameStore(s => s.payImpoundFine)
  const gameState       = useGameStore(s => s.gameState)

  // Show one alert at a time; don't overlap with weekly report
  const alert = threatAlerts[0]
  if (!alert || gameState.lastWeeklySummary !== null) return null

  const vehicle    = gameState.fleet.find(v => v.id === alert.vehicleId)
  const canAfford  = gameState.cash >= alert.fine
  const weeksLeft  = Math.max(0, alert.expiresOnTurn - gameState.turn)
  const stillOwned = !!vehicle?.isImpounded

  function handlePay() {
    payImpoundFine(alert.vehicleId)
    dismissAlert(alert.id)
  }

  function handleDismiss() {
    dismissAlert(alert.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ pointerEvents: 'auto' }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-gray-900 border border-red-800 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-red-950/80 border-b border-red-800 px-5 py-4 flex items-center gap-3">
          <span className="text-2xl leading-none">🚨</span>
          <div>
            <div className="text-sm font-mono font-bold text-red-300 uppercase tracking-wider">
              Vehicle Impounded
            </div>
            <div className="text-xs font-mono text-red-600">
              Action required — game paused
            </div>
          </div>
          {threatAlerts.length > 1 && (
            <span className="ml-auto text-xs font-mono bg-red-900/60 text-red-400 border border-red-700 px-2 py-0.5 rounded">
              +{threatAlerts.length - 1} more
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {/* Vehicle info */}
          <div className="flex items-center gap-3">
            <span className="text-3xl leading-none">{VEHICLE_ICON[alert.vehicleType]}</span>
            <div>
              <div className="text-base font-mono font-semibold text-white">{alert.vehicleName}</div>
              <div className="text-xs font-mono text-gray-500 mt-0.5">
                Fine:{' '}
                <span className="text-red-400 font-semibold">${alert.fine.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Deadline warning */}
          <div className={`rounded-lg px-3 py-2.5 text-xs font-mono border ${
            weeksLeft <= 2
              ? 'bg-orange-950/50 border-orange-800 text-orange-400'
              : 'bg-gray-800 border-gray-700 text-gray-400'
          }`}>
            {weeksLeft > 0
              ? <>Pay within <span className="font-semibold">{weeksLeft} week{weeksLeft !== 1 ? 's' : ''}</span> or the vehicle is permanently seized.</>
              : <span className="text-red-400">Deadline passed — vehicle will be seized this week.</span>
            }
          </div>

          {/* Insufficient funds notice */}
          {!canAfford && stillOwned && (
            <div className="text-xs font-mono text-red-700">
              Need ${(alert.fine - gameState.cash).toLocaleString()} more to pay.
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {stillOwned && (
              <button
                onClick={handlePay}
                disabled={!canAfford}
                className={`flex-1 py-2.5 text-sm font-mono font-semibold rounded-lg border transition-colors ${
                  canAfford
                    ? 'bg-emerald-900 hover:bg-emerald-800 border-emerald-700 text-emerald-300'
                    : 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                }`}
              >
                Pay Fine — ${alert.fine.toLocaleString()}
              </button>
            )}
            <button
              onClick={handleDismiss}
              className={`py-2.5 text-sm font-mono text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 border border-gray-700 transition-colors ${stillOwned ? 'px-4' : 'flex-1'}`}
            >
              {stillOwned ? 'Dismiss' : 'OK'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
