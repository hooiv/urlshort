'use client'

import { useState } from 'react'
import { Filter } from 'lucide-react'
import { FUNNEL_MAX_STEPS, FUNNEL_WINDOW_OPTIONS, type FunnelStep } from '@/lib/conversion-funnel'

type FunnelResult = { clicks: number; steps: FunnelStep[] }

export default function FunnelPage() {
  const [shortCode, setShortCode] = useState('')
  const [steps, setSteps] = useState('lead,sale')
  const [days, setDays] = useState<number>(30)
  const [result, setResult] = useState<FunnelResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function run(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ steps: steps.replace(/\s+/g, ''), days: String(days) })
      const r = await fetch(`/api/analytics/${encodeURIComponent(shortCode.trim())}/funnel?${qs}`)
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Request failed')
      setResult(body)
    } catch (err) {
      setResult(null)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const rows = result ? [{ key: 'Human clicks', count: result.clicks, pct: 100, step: null as number | null, drop: 0 }, ...result.steps.map((s) => ({ key: s.key, count: s.count, pct: s.overallRatePct ?? 0, step: s.stepRatePct, drop: s.dropOff }))] : []

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold"><Filter size={20} /> Conversion funnel</h1>
      <form onSubmit={run} className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">Short code
          <input required value={shortCode} onChange={(e) => setShortCode(e.target.value)} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">Goal keys in order (max {FUNNEL_MAX_STEPS})
          <input required value={steps} onChange={(e) => setSteps(e.target.value)} className="rounded border px-2 py-1" placeholder="signup,purchase" />
        </label>
        <label className="flex flex-col gap-1">Window
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded border px-2 py-1">
            {FUNNEL_WINDOW_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <button type="submit" disabled={loading} className="rounded border px-3 py-1 font-medium disabled:opacity-50">{loading ? 'Loading…' : 'Show funnel'}</button>
      </form>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {result && (
        <ul className="space-y-2" aria-label="Funnel steps">
          {rows.map((r) => (
            <li key={r.key} className="text-sm">
              <div className="flex justify-between"><span className="font-medium">{r.key}</span><span>{r.count.toLocaleString()} · {r.pct}%{r.step !== null && ` · ${r.step}% of previous`}{r.drop > 0 && ` · −${r.drop.toLocaleString()}`}</span></div>
              <div className="h-3 rounded bg-black/10"><div className="h-3 rounded bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, r.pct))}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
