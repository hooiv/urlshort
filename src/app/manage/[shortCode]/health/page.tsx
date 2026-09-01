/* eslint-disable react-hooks/set-state-in-effect -- remote/session synchronization occurs after mount. */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  XCircle,
  Zap,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

type Status = 'unknown' | 'healthy' | 'degraded' | 'down'

interface RuleHealth {
  id: string
  name: string
  destinationUrl: string
  enabled: boolean
  healthStatus: Status
  healthCheckedAt: string | null
  healthLatencyMs: number | null
  healthStatusCode: number | null
  healthLastError: string | null
  consecutiveFailures: number
  consecutiveSuccesses: number
}

interface ProbeCheck {
  id: string
  targetUrl: string
  status: Status
  statusCode: number | null
  latencyMs: number | null
  error: string | null
  checkedAt: string
  ruleId: string | null
  revisionId: string | null
}

interface HealthData {
  url: {
    healthStatus: Status
    healthCheckedAt: string | null
    healthLatencyMs: number | null
    healthStatusCode: number | null
    healthLastError: string | null
    healthConsecutiveFailures: number
    healthConsecutiveSuccesses: number
    autoFailoverEnabled: boolean
    lastHealthyRevisionId: string | null
  }
  rules: RuleHealth[]
  checks: ProbeCheck[]
}

function tokenFor(shortCode: string) {
  return typeof window !== 'undefined' ? sessionStorage.getItem(`ql-token:${shortCode}`) : null
}

export default function HealthPage() {
  const { shortCode } = useParams<{ shortCode: string }>()
  const [token, setToken] = useState<string | null>(null)
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState<string | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)

  useEffect(() => {
    setToken(tokenFor(shortCode))
  }, [shortCode])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/health`, {
        headers: { 'x-management-token': token || '' },
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load reliability data')
      setData(payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load reliability data')
    } finally {
      setLoading(false)
    }
  }, [shortCode, token])

  useEffect(() => {
    if (token) void load()
  }, [token, load])

  async function check(target: string) {
    if (!token) return
    setChecking(target)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({ target }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Health check failed')
      toast.success(
        payload.status === 'down'
          ? `Destination is DOWN (HTTP ${payload.statusCode || 'Error'})`
          : `Destination healthy (${payload.latencyMs}ms, HTTP ${payload.statusCode})`
      )
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Health check failed')
    } finally {
      setChecking(null)
    }
  }

  async function checkAll() {
    if (!token || !data) return
    setCheckingAll(true)
    try {
      await check('fallback')
      for (const rule of data.rules.filter((r) => r.enabled)) {
        await check(rule.id)
      }
      toast.success('Swept all routing endpoints')
    } catch {
      // Handled in check
    } finally {
      setCheckingAll(false)
    }
  }

  async function toggleFailover() {
    if (!token || !data) return
    const enabled = !data.url.autoFailoverEnabled
    const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/health`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-management-token': token },
      body: JSON.stringify({ autoFailoverEnabled: enabled }),
    })
    const payload = await response.json()
    if (!response.ok) return toast.error(payload.error || 'Could not update failover setting')
    setData({ ...data, url: { ...data.url, autoFailoverEnabled: enabled } })
    toast.success(enabled ? 'Automatic failover enabled' : 'Automatic failover paused')
  }

  // Compute Latency History and Status Distribution
  const probeStats = useMemo(() => {
    if (!data || !data.checks.length) return null
    const validLatencies = data.checks
      .map((c) => c.latencyMs)
      .filter((l): l is number => l != null && l > 0)
    const avgLatency = validLatencies.length
      ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
      : 0
    const maxLatency = validLatencies.length ? Math.max(...validLatencies) : 100

    const successes = data.checks.filter((c) => c.status === 'healthy').length
    const failures = data.checks.filter((c) => c.status === 'down').length
    const degraded = data.checks.filter((c) => c.status === 'degraded').length

    return { avgLatency, maxLatency, successes, failures, degraded }
  }, [data])

  if (!token) return <AccessDenied shortCode={shortCode} />
  if (!data && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">
        <RefreshCw className="h-4 w-4 animate-spin text-blue-400 mr-2" />
        Loading reliability telemetry…
      </div>
    )
  }
  if (!data) return null

  const status = data.url.healthStatus

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/manage/${shortCode}`}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
              title="Return to Campaign Controls"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span className="font-semibold text-white">Reliability & Circuit Breaker</span>
                <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[11px] text-blue-400">
                  /{shortCode}
                </span>
              </div>
              <p className="text-xs text-slate-500">Automated endpoint uptime monitoring and zero-downtime failover</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/manage/${shortCode}/qr`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
            >
              <QrCode className="h-3.5 w-3.5" /> QR Studio
            </Link>
            <a
              href={`/${shortCode}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-400"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Test Link
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* Status Banner */}
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
                  {data.url.healthCheckedAt
                    ? `Last active probe executed ${new Date(data.url.healthCheckedAt).toLocaleString()}`
                    : 'No health check probe recorded yet.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={() => void check('fallback')}
                disabled={checking === 'fallback' || checkingAll}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-60 transition shadow-lg shadow-blue-500/20"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${checking === 'fallback' ? 'animate-spin' : ''}`} />
                {checking === 'fallback' ? 'Testing…' : 'Probe Fallback URL'}
              </button>

              <button
                onClick={() => void checkAll()}
                disabled={checkingAll}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-60 transition"
              >
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                {checkingAll ? 'Probing All Targets…' : 'Sweep All Rules'}
              </button>

              <button
                onClick={() => void toggleFailover()}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                  data.url.autoFailoverEnabled
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400'
                }`}
              >
                {data.url.autoFailoverEnabled ? 'Circuit Breaker: Active' : 'Circuit Breaker: Paused'}
              </button>
            </div>
          </div>
        </section>

        {/* Metrics Grid */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Response Latency"
            value={data.url.healthLatencyMs == null ? '—' : `${data.url.healthLatencyMs} ms`}
            sub={probeStats ? `Avg: ${probeStats.avgLatency}ms` : undefined}
          />
          <Metric
            label="HTTP Status Code"
            value={data.url.healthStatusCode == null ? '—' : `HTTP ${data.url.healthStatusCode}`}
            sub={status === 'healthy' ? '200 OK' : data.url.healthLastError || undefined}
          />
          <Metric
            label="Consecutive Successes"
            value={String(data.url.healthConsecutiveSuccesses)}
            sub="2 needed for healthy"
          />
          <Metric
            label="Consecutive Failures"
            value={String(data.url.healthConsecutiveFailures)}
            sub="3 trips circuit breaker"
            warn={data.url.healthConsecutiveFailures > 0}
          />
        </section>

        {/* Latency History Visualizer */}
        {data.checks.length > 0 && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white text-sm">Probe Latency Timeline</h2>
                <p className="text-xs text-slate-400">Response duration (ms) for recent background health checks</p>
              </div>
              {probeStats && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-emerald-400 font-medium">{probeStats.successes} Passed</span>
                  {probeStats.failures > 0 && (
                    <span className="text-red-400 font-medium">{probeStats.failures} Failed</span>
                  )}
                </div>
              )}
            </div>

            {/* Pure SVG Latency Bar Chart */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="h-28 flex items-end gap-1.5 w-full">
                {data.checks.slice(-24).map((c) => {
                  const lat = c.latencyMs || 20
                  const maxH = probeStats?.maxLatency ? Math.max(probeStats.maxLatency, 100) : 200
                  const heightPercent = Math.min(Math.max((lat / maxH) * 100, 10), 100)
                  const isError = c.status === 'down' || (c.statusCode && c.statusCode >= 400)

                  return (
                    <div
                      key={c.id}
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
                        <div className="font-bold">{c.latencyMs ?? '—'} ms</div>
                        <div className="text-slate-400 font-mono">HTTP {c.statusCode || 'ERR'}</div>
                        <div className="text-[9px] text-slate-500">{new Date(c.checkedAt).toLocaleTimeString()}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* Routing Targets & Circuit Breaker Logic */}
        <section className="grid gap-8 lg:grid-cols-2">
          {/* Circuit Breaker Settings */}
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
                <span className={data.url.autoFailoverEnabled ? 'font-bold text-emerald-400' : 'text-slate-500'}>
                  {data.url.autoFailoverEnabled ? 'ARMED & ACTIVE' : 'PAUSED'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Last Healthy Snapshot</span>
                <span className="font-mono text-slate-300">
                  {data.url.lastHealthyRevisionId ? `rev_${data.url.lastHealthyRevisionId.slice(0, 8)}` : 'Current Default'}
                </span>
              </div>
            </div>
          </div>

          {/* Active Routing Rules Health */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-white text-base">
                <Activity className="h-5 w-5 text-blue-400" />
                <span>Routing Rule Targets</span>
              </div>
              <span className="text-xs font-mono text-slate-500">
                {data.rules.filter((r) => r.enabled).length} Enabled
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Unhealthy rule variants are automatically skipped during traffic evaluation until recovery.
            </p>

            <div className="space-y-3">
              {data.rules.filter((r) => r.enabled).map((rule) => (
                <RuleHealthCard
                  key={rule.id}
                  rule={rule}
                  checking={checking === rule.id}
                  onCheck={() => void check(rule.id)}
                />
              ))}
              {!data.rules.some((r) => r.enabled) && (
                <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
                  No active routing rules configured.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Detailed Probe History Logs */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white text-base">Probe Execution Log</h2>
            <span className="text-xs font-mono text-slate-500">{data.checks.length} Recorded Probes</span>
          </div>

          <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
            {data.checks.length ? (
              data.checks.slice(0, 15).map((check) => (
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
      </main>
    </div>
  )
}

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

function labelStatus(status: Status) {
  switch (status) {
    case 'healthy':
      return 'All Systems Operational'
    case 'degraded':
      return 'Performance Degraded'
    case 'down':
      return 'Destination Endpoint Down'
    default:
      return 'Health Status Unknown'
  }
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'healthy') return <CheckCircle2 className="h-8 w-8 text-emerald-400" />
  if (status === 'down') return <XCircle className="h-8 w-8 text-red-400" />
  if (status === 'degraded') return <TriangleAlert className="h-8 w-8 text-amber-400" />
  return <Activity className="h-8 w-8 text-slate-500" />
}

function StatusPill({ status }: { status: Status }) {
  const styles = {
    healthy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    down: 'bg-red-500/10 text-red-400 border-red-500/30',
    degraded: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    unknown: 'bg-slate-800 text-slate-400 border-slate-700',
  }
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
        styles[status]
      }`}
    >
      {status}
    </span>
  )
}

function RuleHealthCard({
  rule,
  checking,
  onCheck,
}: {
  rule: RuleHealth
  checking: boolean
  onCheck: () => void
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusPill status={rule.healthStatus} />
            <span className="font-semibold text-sm text-slate-200 truncate">{rule.name}</span>
          </div>
          <p className="mt-1.5 truncate font-mono text-xs text-blue-400">{rule.destinationUrl}</p>
          <div className="mt-2 text-[11px] text-slate-500">
            {rule.healthCheckedAt
              ? `${new Date(rule.healthCheckedAt).toLocaleTimeString()} · ${
                  rule.healthLatencyMs ?? '—'
                }ms · HTTP ${rule.healthStatusCode || '—'}`
              : 'Never probed'}
          </div>
        </div>

        <button
          onClick={onCheck}
          disabled={checking}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-700 disabled:opacity-50 transition"
        >
          <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Probing…' : 'Probe'}
        </button>
      </div>
    </div>
  )
}

function AccessDenied({ shortCode }: { shortCode: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-slate-500" />
        <h1 className="mt-4 text-xl font-semibold">Private Reliability Console</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Open this page with the management token for <span className="font-mono text-slate-300">/{shortCode}</span>.
        </p>
        <Link
          href={`/manage/${shortCode}`}
          className="mt-6 inline-flex rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-400"
        >
          Back to Campaign Controls
        </Link>
      </div>
    </div>
  )
}
