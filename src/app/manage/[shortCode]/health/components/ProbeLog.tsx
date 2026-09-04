'use client'

import { StatusPill } from './StatusPill'
import type { ProbeCheck } from './types'

export default function ProbeLog({ checks }: { checks: ProbeCheck[] }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white text-base">Probe Execution Log</h2>
        <span className="text-xs font-mono text-slate-500">{checks.length} Recorded Probes</span>
      </div>

      <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
        {checks.length ? (
          checks.slice(0, 15).map((check) => (
            <div key={check.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-2 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <StatusPill status={check.status} />
                <div className="min-w-0">
                  <div className="font-mono text-slate-200 truncate max-w-md">{check.targetUrl}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {new Date(check.checkedAt).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-slate-300">
                  {check.statusCode ? `HTTP ${check.statusCode}` : 'ERR'} · {check.latencyMs ?? '—'} ms
                </span>
                {check.error && <span className="text-red-400 truncate max-w-xs">{check.error}</span>}
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-xs text-slate-500">No probe history recorded yet.</div>
        )}
      </div>
    </section>
  )
}
