'use client'

import { useEffect, useState } from 'react'
import { formatNumber } from '@/lib/format'

type Result = { days: number; uniqueVisitors: number; newVisitors: number; returningVisitors: number; returningRate: number; clicksPerVisitor: number; anonymousClicks: number }

export default function VisitorRetention({ shortCode }: { shortCode: string }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/analytics/${encodeURIComponent(shortCode)}/visitors?days=${days}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load visitors')
        setError(null)
        setData(await res.json())
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [shortCode, days])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6" aria-label="New vs returning visitors">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-white">New vs returning visitors</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Visitors window" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      {error ? <p className="text-xs text-rose-400">{error}</p> : !data ? <p className="text-xs text-slate-500">Loading…</p> : data.uniqueVisitors === 0 ? (
        <p className="text-xs text-slate-500">No identifiable human visitors in this window yet.</p>
      ) : (
        <div className="text-xs text-slate-300">
          <div className="mb-2 flex h-2 overflow-hidden rounded bg-slate-800" role="img" aria-label={`${data.returningRate}% returning`}>
            <div className="bg-emerald-400" style={{ width: `${data.returningRate}%` }} />
            <div className="bg-sky-400" style={{ width: `${100 - data.returningRate}%` }} />
          </div>
          <p><span className="text-sky-400">New {formatNumber(data.newVisitors)}</span> · <span className="text-emerald-400">Returning {formatNumber(data.returningVisitors)} ({data.returningRate}%)</span></p>
          <p className="mt-1 text-slate-500">{data.clicksPerVisitor} clicks per visitor{data.anonymousClicks > 0 ? ` · ${formatNumber(data.anonymousClicks)} clicks without a visitor id excluded` : ''}</p>
        </div>
      )}
    </section>
  )
}
