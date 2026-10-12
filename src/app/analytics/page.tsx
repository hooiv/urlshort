'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, BarChart3, DollarSign, Link2, MousePointerClick, Target } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/format'
import TrendingLinks from './TrendingLinks'
import KpiCard from './[shortCode]/components/KpiCard'
import TimeSeriesChart from './[shortCode]/components/TimeSeriesChart'
import { TechBar } from './[shortCode]/components/BreakdownCard'
import type { ChartMetric } from './[shortCode]/components/types'

type Breakdown = { key: string; clicks: number }
type Overview = {
  window: { from: string; to: string; days: number }
  links: number
  totals: { clicks: number; conversions: number; revenueCents: number; conversionRate: number }
  change: { clicks: number | null; conversions: number | null; revenueCents: number | null }
  revenueByCurrency: Array<{ currency: string; valueCents: number }>
  timeseries: Array<{ date: string; clicks: number; conversions: number; revenueCents: number }>
  topLinks: Array<{ id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; conversions: number; revenueCents: number }>
  tags: Array<{ tag: string; links: number; clicks: number }>
  breakdowns: { window: { from: string; to: string }; countries: Breakdown[]; devices: Breakdown[]; referrers: Breakdown[] }
}
type Workspace = { id: string; name: string }

const RANGES = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '365d', label: '12 months' },
]

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-500">new vs previous period</span>
  const up = value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(value)}% vs previous period
    </span>
  )
}

function BreakdownList({ title, rows }: { title: string; rows: Breakdown[] }) {
  const total = rows.reduce((sum, row) => sum + row.clicks, 0)
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-2">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {rows.length === 0 && <p className="text-xs text-slate-500">No human clicks in this window.</p>}
      {rows.map((row) => (
        <TechBar key={row.key} label={row.key} count={row.clicks} percentage={total ? (row.clicks / total) * 100 : 0} />
      ))}
    </div>
  )
}

export default function AnalyticsOverviewPage() {
  const [range, setRange] = useState('30d')
  const [workspaceId, setWorkspaceId] = useState('')
  const [tag, setTag] = useState('')
  const [folder, setFolder] = useState('')
  const [folders, setFolders] = useState<Array<{ id: string; name: string; restricted: boolean }>>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<ChartMetric>('both')

  // Deep links from the folders screen: /analytics?workspaceId=…&folder=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ws = params.get('workspaceId')
    if (ws) setWorkspaceId(ws) // eslint-disable-line react-hooks/set-state-in-effect -- one-time read of the URL after mount
    const f = params.get('folder')
    if (ws && f) setFolder(f)
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    const controller = new AbortController()
    fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/folders`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { folders: [] }))
      .then((body: { folders?: Array<{ id: string; name: string; restricted: boolean }> }) => setFolders(body.folders ?? []))
      .catch(() => undefined)
    return () => controller.abort()
  }, [workspaceId])

  useEffect(() => {
    fetch('/api/workspaces')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: Workspace[]) => setWorkspaces(Array.isArray(rows) ? rows : []))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ range })
    if (workspaceId) query.set('workspaceId', workspaceId)
    if (tag) query.set('tag', tag)
    if (workspaceId && folder) query.set('folder', folder)
    fetch(`/api/analytics?${query}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || 'Could not load analytics')
        setData(body as Overview)
        setError(null)
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load analytics')
      })
    return () => controller.abort()
  }, [range, workspaceId, tag, folder])

  const series = useMemo(() => {
    const clicks: Record<string, number> = {}
    const conversions: Record<string, number> = {}
    const revenue: Record<string, number> = {}
    for (const day of data?.timeseries ?? []) {
      clicks[day.date] = day.clicks
      conversions[day.date] = day.conversions
      revenue[day.date] = day.revenueCents
    }
    return { clicks, conversions, revenue }
  }, [data])

  const multiCurrency = (data?.revenueByCurrency.length ?? 0) > 1

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-7 w-7 text-blue-400" /> Analytics
            </h1>
            <p className="text-sm text-slate-400 mt-1">Every link at once: clicks, conversions and revenue.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <select value={workspaceId} onChange={(e) => { setWorkspaceId(e.target.value); setTag(''); setFolder(''); setFolders([]) }} aria-label="Scope" className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
              <option value="">My links</option>
              {workspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
            </select>
            {workspaceId && folders.length > 0 && (
              <select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder" className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
                <option value="">All folders</option>
                <option value="none">Not in a folder</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.restricted ? '🔒 ' : ''}{f.name}</option>)}
              </select>
            )}
            <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range" className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
              {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {tag && (
              <button onClick={() => setTag('')} className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-blue-200">
                Tag: {tag} ✕
              </button>
            )}
          </div>
        </div>

        {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
        {!data && !error && <p className="text-sm text-slate-500">Loading…</p>}

        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard icon={<MousePointerClick className="h-4 w-4 text-blue-400" />} label="Clicks" value={formatNumber(data.totals.clicks)} subtext={`${data.window.from} to ${data.window.to}`} />
              <KpiCard icon={<Target className="h-4 w-4 text-emerald-400" />} label="Conversions" value={formatNumber(data.totals.conversions)} subtext={`${data.totals.conversionRate}% of clicks`} />
              <KpiCard
                icon={<DollarSign className="h-4 w-4 text-amber-400" />}
                label="Revenue"
                value={multiCurrency ? `${data.revenueByCurrency.length} currencies` : formatCurrency(data.totals.revenueCents)}
                subtext={multiCurrency ? data.revenueByCurrency.map((r) => `${r.currency} ${(r.valueCents / 100).toFixed(2)}`).join(' · ') : ''}
              />
              <KpiCard icon={<Link2 className="h-4 w-4 text-violet-400" />} label="Links" value={formatNumber(data.links)} subtext={tag ? `tagged ${tag}` : 'in scope'} />
            </div>
            <div className="flex flex-wrap gap-6 text-xs">
              <span>Clicks <Change value={data.change.clicks} /></span>
              <span>Conversions <Change value={data.change.conversions} /></span>
              <span>Revenue <Change value={data.change.revenueCents} /></span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="mb-3 flex gap-2 text-xs">
                {(['both', 'clicks', 'conversions', 'revenue'] as ChartMetric[]).map((m) => (
                  <button key={m} onClick={() => setMetric(m)} className={`rounded-lg px-3 py-1 ${metric === m ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300'}`}>
                    {m === 'both' ? 'Clicks + conversions' : m[0].toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
              <TimeSeriesChart clicksByDate={series.clicks} conversionByDate={series.conversions} revenueByDate={series.revenue} metric={metric} isHourly={false} />
            </div>

            <TrendingLinks workspaceId={workspaceId} />

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Top links</h3>
                <table className="w-full text-xs">
                  <thead className="text-slate-500">
                    <tr><th className="text-left font-medium pb-2">Link</th><th className="text-right font-medium">Clicks</th><th className="text-right font-medium">Conv.</th><th className="text-right font-medium">Revenue</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.topLinks.map((link) => (
                      <tr key={link.id}>
                        <td className="py-2 pr-2">
                          <Link href={`/analytics/${link.shortCode}`} className="font-mono text-blue-300 hover:underline">/{link.shortCode}</Link>
                          <div className="truncate max-w-xs text-slate-500">{link.title || link.originalUrl}</div>
                        </td>
                        <td className="text-right text-slate-200">{formatNumber(link.clicks)}</td>
                        <td className="text-right text-slate-200">{formatNumber(link.conversions)}</td>
                        <td className="text-right text-slate-200">{formatCurrency(link.revenueCents)}</td>
                      </tr>
                    ))}
                    {data.topLinks.length === 0 && <tr><td colSpan={4} className="py-4 text-slate-500">No clicks in this window.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-2">
                <h3 className="text-sm font-semibold text-white">Tags</h3>
                {tag && <p className="text-xs text-slate-500">Filtered to one tag.</p>}
                {!tag && data.tags.length === 0 && <p className="text-xs text-slate-500">No tagged links.</p>}
                {data.tags.map((row) => (
                  <button key={row.tag} onClick={() => setTag(row.tag)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-slate-800">
                    <span className="text-slate-200">{row.tag} <span className="text-slate-500">· {row.links} links</span></span>
                    <span className="font-semibold">{formatNumber(row.clicks)}</span>
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-500">Breakdowns: human traffic, {data.breakdowns.window.from} to {data.breakdowns.window.to}.</p>
            <div className="grid gap-4 md:grid-cols-3">
              <BreakdownList title="Countries" rows={data.breakdowns.countries} />
              <BreakdownList title="Devices" rows={data.breakdowns.devices} />
              <BreakdownList title="Referrers" rows={data.breakdowns.referrers} />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
