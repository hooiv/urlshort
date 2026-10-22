'use client'

import { useEffect, useState } from 'react'

type Insight = { id: string; severity: 'info' | 'positive' | 'warning'; message: string; data: Record<string, number | string> }
type Result = { insights: Insight[] }

const STYLES: Record<Insight['severity'], string> = {
  positive: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  info: 'border-slate-700 bg-slate-950 text-slate-300',
}

export default function LinkInsights({ shortCode }: { shortCode: string }) {
  const [days, setDays] = useState(30)
  const [items, setItems] = useState<Insight[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/analytics/${encodeURIComponent(shortCode)}/insights?days=${days}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load insights')
        const body = (await res.json()) as Result
        setError(null)
        setItems(body.insights ?? [])
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [shortCode, days])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6" aria-label="Insights">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Insights</h3>
          <p className="text-xs text-slate-500">Rule-based findings from human clicks, each backed by numbers</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Insights window" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">
          {[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      {error ? <p className="text-xs text-rose-400">{error}</p> : !items ? <p className="text-xs text-slate-500">Loading…</p> : items.length === 0 ? (
        <p className="text-xs text-slate-500">Not enough clicks in this window to say anything reliable yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => <li key={i.id} className={`rounded-lg border px-3 py-2 text-sm ${STYLES[i.severity]}`}>{i.message}</li>)}
        </ul>
      )}
    </section>
  )
}
