'use client'

import { useEffect, useState } from 'react'
import { formatNumber } from '@/lib/format'

type Row = { value: string; clicks: number; share: number }
type Result = { dimension: string; days: number; total: number; rows: Row[]; otherClicks: number }
const DIMENSIONS = ['source', 'medium', 'campaign', 'term', 'content'] as const

export default function UtmBreakdown({ shortCode }: { shortCode: string }) {
  const [by, setBy] = useState<(typeof DIMENSIONS)[number]>('source')
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/analytics/${encodeURIComponent(shortCode)}/utm?by=${by}&days=${days}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load UTM data')
        setError(null)
        setData(await res.json())
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [shortCode, by, days])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6" aria-label="UTM breakdown">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-white">UTM breakdown</h3>
        <div className="flex gap-2">
          <select value={by} onChange={(e) => setBy(e.target.value as typeof by)} aria-label="UTM dimension" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">
            {DIMENSIONS.map((d) => <option key={d} value={d}>utm_{d}</option>)}
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="UTM window" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">
            {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </div>
      </div>
      {error ? <p className="text-xs text-rose-400">{error}</p> : !data ? <p className="text-xs text-slate-500">Loading…</p> : data.total === 0 ? (
        <p className="text-xs text-slate-500">No human clicks in this window yet.</p>
      ) : (
        <ul className="space-y-2">
          {data.rows.map((r) => (
            <li key={r.value} className="text-xs">
              <div className="mb-1 flex justify-between text-slate-300"><span className="truncate pr-2">{r.value}</span><span>{formatNumber(r.clicks)} · {r.share}%</span></div>
              <div className="h-1.5 rounded bg-slate-800"><div className="h-1.5 rounded bg-emerald-400" style={{ width: `${Math.max(2, r.share)}%` }} /></div>
            </li>
          ))}
          {data.otherClicks > 0 && <li className="text-xs text-slate-500">+ {formatNumber(data.otherClicks)} clicks in other values</li>}
        </ul>
      )}
    </section>
  )
}
