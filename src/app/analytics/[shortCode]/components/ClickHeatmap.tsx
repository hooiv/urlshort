'use client'

import { useEffect, useState } from 'react'
import { formatNumber } from '@/lib/format'

type Slot = { day: number; hour: number; clicks: number }
type Heatmap = { timezone: string; days: number; grid: number[][]; total: number; peak: Slot | null; topSlots: Slot[] }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`

/** Intensity 0..1 on a sqrt scale so a single viral hour doesn't flatten every other cell. */
export function cellIntensity(clicks: number, max: number): number {
  return max <= 0 || clicks <= 0 ? 0 : Math.sqrt(clicks / max)
}

export default function ClickHeatmap({ shortCode }: { shortCode: string }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Heatmap | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    fetch(`/api/analytics/${encodeURIComponent(shortCode)}/heatmap?tz=${encodeURIComponent(tz)}&days=${days}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load heatmap')
        setError(null)
        setData(await res.json())
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [shortCode, days])

  const max = data ? Math.max(...data.grid.flat()) : 0

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6" aria-label="Best time to post">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Best time to post</h3>
          <p className="text-xs text-slate-500">Human clicks by weekday and hour{data ? ` (${data.timezone})` : ''}</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Heatmap window" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">
          {[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      {error ? <p className="text-xs text-rose-400">{error}</p> : !data ? <p className="text-xs text-slate-500">Loading…</p> : data.total === 0 ? (
        <p className="text-xs text-slate-500">No human clicks in this window yet.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-300">
            Peak: <span className="font-semibold text-white">{DAYS[data.peak!.day]} {hourLabel(data.peak!.hour)}</span> with {formatNumber(data.peak!.clicks)} clicks
          </p>
          <div className="overflow-x-auto">
            <div className="grid min-w-[560px] gap-[2px]" style={{ gridTemplateColumns: '2.5rem repeat(24, minmax(0, 1fr))' }} role="table">
              <div />
              {Array.from({ length: 24 }, (_, h) => <div key={h} className="text-center text-[9px] text-slate-500">{h % 3 === 0 ? hourLabel(h) : ''}</div>)}
              {data.grid.map((row, day) => (
                <div key={day} className="contents" role="row">
                  <div className="pr-1 text-right text-[10px] leading-5 text-slate-400">{DAYS[day]}</div>
                  {row.map((clicks, hour) => (
                    <div
                      key={hour}
                      role="cell"
                      title={`${DAYS[day]} ${hourLabel(hour)}: ${clicks} clicks`}
                      className="h-5 rounded-sm bg-emerald-400"
                      style={{ opacity: clicks === 0 ? 0.06 : 0.15 + 0.85 * cellIntensity(clicks, max) }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
