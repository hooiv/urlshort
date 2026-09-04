'use client'

import { barHeightPercent, isErrorProbe } from './healthStats'
import type { ProbeCheck, ProbeStats } from './types'

export default function LatencyTimeline({
  checks,
  stats,
}: {
  checks: ProbeCheck[]
  stats: ProbeStats | null
}) {
  if (!checks.length) return null
  const maxLatency = stats?.maxLatency && stats.maxLatency > 0 ? stats.maxLatency : 100
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white text-sm">Probe Latency Timeline</h2>
          <p className="text-xs text-slate-400">Response duration (ms) for recent background health checks</p>
        </div>
        {stats && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-emerald-400 font-medium">{stats.successes} Passed</span>
            {stats.failures > 0 && (
              <span className="text-red-400 font-medium">{stats.failures} Failed</span>
            )}
          </div>
        )}
      </div>

      {/* Pure SVG Latency Bar Chart */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
        <div className="h-28 flex items-end gap-1.5 w-full">
          {checks.slice(-24).map((check) => {
            const heightPercent = barHeightPercent(check.latencyMs, maxLatency)
            const isError = isErrorProbe(check)

            return (
              <div
                key={check.id}
                className="group relative flex-1 flex flex-col items-center h-full justify-end"
              >
                <div
                  style={{ height: `${heightPercent}%` }}
                  className={`w-full rounded-t transition-all ${
                    isError
                      ? 'bg-red-500 group-hover:bg-red-400'
                      : 'bg-blue-500/70 group-hover:bg-blue-400'
                  }`}
                />
                {/* Tooltip on hover */}
                <div className="pointer-events-none absolute bottom-full mb-2 hidden rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-white shadow-xl group-hover:block z-10 whitespace-nowrap">
                  <div className="font-bold">{check.latencyMs ?? '—'} ms</div>
                  <div className="text-slate-400 font-mono">HTTP {check.statusCode || 'ERR'}</div>
                  <div className="text-[9px] text-slate-500">{new Date(check.checkedAt).toLocaleTimeString()}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
