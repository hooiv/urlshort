'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { formatNumber } from '@/lib/format'

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; previousClicks: number; delta: number; changePercent: number | null }

export default function TrendingLinks({ workspaceId }: { workspaceId: string }) {
  const [days, setDays] = useState(7)
  const [direction, setDirection] = useState<'rising' | 'falling'>('rising')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const q = new URLSearchParams({ days: String(days), direction, limit: '8' })
    if (workspaceId) q.set('workspaceId', workspaceId)
    fetch(`/api/analytics/trending?${q}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Could not load trending links')
        setError(null)
        setRows(body.links as Row[])
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [workspaceId, days, direction])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5" aria-label="Trending links">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{direction === 'rising' ? 'Trending up' : 'Losing traction'}</h3>
        <div className="flex gap-2 text-xs">
          <select value={direction} onChange={(e) => setDirection(e.target.value as 'rising' | 'falling')} aria-label="Trend direction" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1">
            <option value="rising">Rising</option>
            <option value="falling">Falling</option>
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Trend window" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1">
            {[1, 7, 14, 30, 90].map((d) => <option key={d} value={d}>{d === 1 ? 'Last 24h' : `Last ${d} days`}</option>)}
          </select>
        </div>
      </div>
      {error ? <p className="text-xs text-rose-400">{error}</p> : !rows ? <p className="text-xs text-slate-500">Loading…</p> : rows.length === 0 ? (
        <p className="text-xs text-slate-500">No links moved meaningfully versus the previous period (links need at least 5 clicks in one of the two periods).</p>
      ) : (
        <ul className="divide-y divide-slate-800 text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <Link href={`/analytics/${encodeURIComponent(r.shortCode)}`} className="min-w-0 truncate text-blue-300 hover:underline">{r.title || r.shortCode}</Link>
              <span className={`inline-flex shrink-0 items-center gap-1 ${r.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {r.delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {r.delta >= 0 ? '+' : ''}{formatNumber(r.delta)} ({formatNumber(r.previousClicks)} → {formatNumber(r.clicks)}){r.changePercent === null ? ' new' : ` ${r.changePercent}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
