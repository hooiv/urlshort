'use client'

import { formatNumber } from '@/lib/format'
import type { HealthData, ProbeStats } from './types'

function Metric({
  label,
  value,
  sub,
  warn = false,
}: {
  label: string
  value: string
  sub?: string
  warn?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border bg-slate-900/70 p-5 ${
        warn ? 'border-amber-500/40' : 'border-slate-800'
      }`}
    >
      <div className="text-xs text-slate-400 font-medium">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-slate-500">{sub}</div>}
    </div>
  )
}

export default function MetricsGrid({
  data,
  probeStats,
}: {
  data: HealthData
  probeStats: ProbeStats | null
}) {
  const status = data.url.healthStatus
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric
        label="Response Latency"
        value={data.url.healthLatencyMs == null ? '—' : `${formatNumber(data.url.healthLatencyMs)} ms`}
        sub={probeStats ? `Avg: ${formatNumber(probeStats.avgLatency)}ms` : undefined}
      />
      <Metric
        label="HTTP Status Code"
        value={data.url.healthStatusCode == null ? '—' : `HTTP ${data.url.healthStatusCode}`}
        sub={status === 'healthy' ? '200 OK' : data.url.healthLastError || undefined}
      />
      <Metric
        label="Consecutive Successes"
        value={formatNumber(data.url.healthConsecutiveSuccesses)}
        sub="2 needed for healthy"
      />
      <Metric
        label="Consecutive Failures"
        value={formatNumber(data.url.healthConsecutiveFailures)}
        sub="3 trips circuit breaker"
        warn={data.url.healthConsecutiveFailures > 0}
      />
    </section>
  )
}
