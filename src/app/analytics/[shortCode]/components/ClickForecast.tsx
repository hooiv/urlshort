'use client'

import { useEffect, useState } from 'react'
import { formatNumber } from '@/lib/format'

type Forecast = {
  windowDays: number
  dailyAverage: number
  trend: number
  currentTotal: number
  target: number | null
  daysToTarget: number | null
  projectedDate: string | null
  projectedNext7Days: number
}

/** Parses the target input; returns undefined for empty, null for invalid (mirrors the API's limits). */
export function parseTargetInput(raw: string): number | null | undefined {
  const t = raw.replace(/[,\s_]/g, '')
  if (t === '') return undefined
  if (!/^\d{1,10}$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= 1_000_000_000 ? n : null
}

export default function ClickForecast({ shortCode }: { shortCode: string }) {
  const [raw, setRaw] = useState('')
  const [data, setData] = useState<Forecast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const target = parseTargetInput(raw)

  useEffect(() => {
    if (target === null) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const qs = target === undefined ? '' : `?target=${target}`
      fetch(`/api/analytics/${encodeURIComponent(shortCode)}/forecast${qs}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load forecast')
          setError(null)
          setData(await res.json())
        })
        .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [shortCode, target])

  const accelerating = data ? data.trend > 0.05 : false
  const slowing = data ? data.trend < -0.05 : false

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6" aria-label="Click forecast">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Click forecast</h3>
          <p className="text-xs text-slate-500">Projected from the last {data?.windowDays ?? 14} complete days of human clicks</p>
        </div>
        <label className="text-xs text-slate-400">
          Click goal
          <input
            inputMode="numeric"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="e.g. 10,000"
            aria-invalid={target === null}
            className="ml-2 w-28 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          />
        </label>
      </div>
      {target === null ? <p className="text-xs text-rose-400">Enter a whole number from 1 to 1,000,000,000.</p> : error ? <p className="text-xs text-rose-400">{error}</p> : !data ? <p className="text-xs text-slate-500">Loading…</p> : (
        <div className="space-y-2 text-sm text-slate-300">
          <p>
            Next 7 days: <span className="font-semibold text-white">~{formatNumber(data.projectedNext7Days)}</span> clicks
            <span className="text-slate-500"> ({data.dailyAverage}/day recently{accelerating ? ', accelerating' : slowing ? ', slowing' : ''})</span>
          </p>
          {data.target !== null && (
            data.daysToTarget === 0 ? <p className="text-emerald-400">Goal of {formatNumber(data.target)} already reached.</p>
            : data.projectedDate ? <p>Reaches {formatNumber(data.target)} around <span className="font-semibold text-white">{data.projectedDate}</span> ({formatNumber(data.daysToTarget ?? 0)} days away).</p>
            : <p className="text-amber-400">No recent clicks, so {formatNumber(data.target)} can&apos;t be projected yet.</p>
          )}
        </div>
      )}
    </section>
  )
}
