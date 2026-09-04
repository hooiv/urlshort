'use client'

import { RefreshCw, Zap } from 'lucide-react'
import { labelStatus } from './healthStats'
import { StatusIcon, StatusPill } from './StatusPill'
import type { Status } from './types'

export default function StatusBanner({
  status,
  checkedAt,
  checkingFallback,
  checkingAll,
  failoverEnabled,
  onProbeFallback,
  onSweepAll,
  onToggleFailover,
}: {
  status: Status
  checkedAt: string | null
  checkingFallback: boolean
  checkingAll: boolean
  failoverEnabled: boolean
  onProbeFallback: () => void
  onSweepAll: () => void
  onToggleFailover: () => void
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <StatusIcon status={status} />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-white">{labelStatus(status)}</h1>
              <StatusPill status={status} />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {checkedAt
                ? `Last active probe executed ${new Date(checkedAt).toLocaleString()}`
                : 'No health check probe recorded yet.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={onProbeFallback}
            disabled={checkingFallback || checkingAll}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-60 transition shadow-lg shadow-blue-500/20"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checkingFallback ? 'animate-spin' : ''}`} />
            {checkingFallback ? 'Testing…' : 'Probe Fallback URL'}
          </button>

          <button
            onClick={onSweepAll}
            disabled={checkingAll}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-60 transition"
          >
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            {checkingAll ? 'Probing All Targets…' : 'Sweep All Rules'}
          </button>

          <button
            onClick={onToggleFailover}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
              failoverEnabled
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-800 bg-slate-950 text-slate-400'
            }`}
          >
            {failoverEnabled ? 'Circuit Breaker: Active' : 'Circuit Breaker: Paused'}
          </button>
        </div>
      </div>
    </section>
  )
}
