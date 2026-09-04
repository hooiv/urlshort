'use client'

import { ShieldCheck } from 'lucide-react'

export default function CircuitBreakerPanel({
  autoFailoverEnabled,
  lastHealthyRevisionId,
}: {
  autoFailoverEnabled: boolean
  lastHealthyRevisionId: string | null
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div className="flex items-center gap-2 font-semibold text-white text-base">
        <ShieldCheck className="h-5 w-5 text-blue-400" />
        <span>Automated Circuit Breaker</span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">
        When the fallback URL experiences 3 consecutive network failures or 5xx server errors, QuickLink automatically routes all incoming traffic to the last known healthy revision to prevent broken campaigns.
      </p>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Circuit Breaker Protection</span>
          <span className={autoFailoverEnabled ? 'font-bold text-emerald-400' : 'text-slate-500'}>
            {autoFailoverEnabled ? 'ARMED & ACTIVE' : 'PAUSED'}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Last Healthy Snapshot</span>
          <span className="font-mono text-slate-300">
            {lastHealthyRevisionId ? `rev_${lastHealthyRevisionId.slice(0, 8)}` : 'Current Default'}
          </span>
        </div>
      </div>
    </div>
  )
}
