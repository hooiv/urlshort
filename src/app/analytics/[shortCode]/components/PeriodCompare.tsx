'use client'

import { useEffect, useState } from 'react'
import { formatNumber } from '@/lib/format'

type Result = {
  days: number
  current: { clicks: number }
  previous: { clicks: number }
  changePercent: number | null
  series: Array<{ day: number; current: number; previous: number }>
}

export default function PeriodCompare({ shortCode }: { shortCode: string }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/analytics/${encodeURIComponent(shortCode)}/compare?days=${days}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load comparison')
        setError(null)
        setData(await res.json())
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [shortCode, days])

  const max = data ? Math.max(1, ...data.series.flatMap((p) => [p.current, p.previous])) : 1
  const change = data?.changePercent
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6" aria-label="Period comparison">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-white">Compared to previous period</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Comparison window" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">
          {[7, 14, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      {error ? <p className="text-xs text-rose-400">{error}</p> : !data ? <p className="text-xs text-slate-500">Loading…</p> : (
        <>
          <div className="mb-4 flex items-baseline gap-4">
            <span className="text-2xl font-bold text-white">{formatNumber(data.current.clicks)}</span>
            <span className="text-xs text-slate-400">vs {formatNumber(data.previous.clicks)} before</span>
            <span className={`text-xs font-semibold ${change == null ? 'text-slate-400' : change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {change == null ? (data.current.clicks > 0 ? 'New traffic' : 'No change') : `${change >= 0 ? '+' : ''}${change}%`}
            </span>
          </div>
          <div className="flex h-24 items-end gap-px" role="img" aria-label={`Daily clicks, current period against previous period`}>
            {data.series.map((p) => (
              <div key={p.day} className="relative flex h-full flex-1 items-end" title={`Day ${p.day}: ${p.current} (previous ${p.previous})`}>
                <div className="absolute bottom-0 w-full bg-slate-600/60" style={{ height: `${(p.previous / max) * 100}%` }} />
                <div className="relative w-full bg-emerald-400/80" style={{ height: `${(p.current / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500"><span className="text-emerald-400">■</span> this period · <span className="text-slate-500">■</span> previous period (human clicks)</p>
        </>
      )}
    </section>
  )
}
