'use client'

import { useState } from 'react'
import { Calculator } from 'lucide-react'
import type { SampleSizeInput, SampleSizePlan } from '@/lib/experiment-sample-size'

/** Pre-test planner: how many clicks a destination split needs before its verdict can be trusted. */
export default function ExperimentPlanner({ defaultBaselinePct, defaultDailyClicks }: { defaultBaselinePct?: number; defaultDailyClicks?: number }) {
  const [baseline, setBaseline] = useState(defaultBaselinePct ? String(Number(defaultBaselinePct.toFixed(2))) : '5')
  const [lift, setLift] = useState('20')
  const [variants, setVariants] = useState('2')
  const [daily, setDaily] = useState(defaultDailyClicks ? String(Math.round(defaultDailyClicks)) : '')
  const [result, setResult] = useState<{ input: SampleSizeInput; plan: SampleSizePlan } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function calculate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const qs = new URLSearchParams({
      baselineRate: String(Number(baseline) / 100),
      minRelativeLift: String(Number(lift) / 100),
      variants,
    })
    if (daily) qs.set('dailyClicks', daily)
    try {
      const res = await fetch(`/api/experiments/sample-size?${qs}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not calculate')
      setResult(body)
      setError(null)
    } catch (err) {
      setResult(null)
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm'
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="exp-planner-h">
      <h3 id="exp-planner-h" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Calculator className="h-4 w-4" aria-hidden /> Experiment planner
      </h3>
      <form onSubmit={calculate} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="text-xs text-slate-600">Baseline conversion %
          <input className={field} inputMode="decimal" value={baseline} onChange={(e) => setBaseline(e.target.value)} required />
        </label>
        <label className="text-xs text-slate-600">Smallest lift to detect %
          <input className={field} inputMode="decimal" value={lift} onChange={(e) => setLift(e.target.value)} required />
        </label>
        <label className="text-xs text-slate-600">Variants
          <input className={field} type="number" min={2} max={10} value={variants} onChange={(e) => setVariants(e.target.value)} required />
        </label>
        <label className="text-xs text-slate-600">Clicks per day (optional)
          <input className={field} inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value)} />
        </label>
        <button type="submit" disabled={busy} className="col-span-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-4">
          {busy ? 'Calculating…' : 'Calculate sample size'}
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      {result && (
        <p className="mt-3 text-sm text-slate-700" aria-live="polite">
          You need about <strong>{result.plan.perVariantClicks.toLocaleString()}</strong> clicks per variant
          ({result.plan.totalClicks.toLocaleString()} total) to detect a move from {(Number(baseline)).toString()}% to {(result.plan.targetRate * 100).toFixed(2)}%
          {result.plan.estimatedDays !== null && <> — roughly <strong>{result.plan.estimatedDays}</strong> day{result.plan.estimatedDays === 1 ? '' : 's'} at your traffic</>}.
        </p>
      )}
    </section>
  )
}
