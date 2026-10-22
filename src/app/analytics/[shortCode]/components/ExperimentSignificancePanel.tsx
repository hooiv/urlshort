'use client'

import { useEffect, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import type { ExperimentReport } from '@/lib/experiment-significance'

type Report = ExperimentReport & { days: number; confidence: number; decision?: { action: 'keep_running' | 'ship_variant' | 'keep_control' | 'stop_no_effect'; variantId: string | null; reason: string }; bayesian?: { id: string; probBeatControl: number | null; expectedLoss: number }[] }

const pct = (n: number, d = 2) => `${(n * 100).toFixed(d)}%`

export default function ExperimentSignificancePanel({
  shortCode,
  onPromoteWinner,
}: {
  shortCode: string
  onPromoteWinner: (ruleId: string, opts?: { requireWinner?: boolean }) => Promise<void>
}) {
  const [days, setDays] = useState(30)
  const [confidence, setConfidence] = useState(0.95)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const ctl = new AbortController()
    fetch(`/api/links/${encodeURIComponent(shortCode)}/experiment?days=${days}&confidence=${confidence}`, { signal: ctl.signal })
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Could not load experiment results')
        setReport(body as Report)
        setError(null)
      })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false) })
    return () => ctl.abort()
  }, [shortCode, days, confidence, nonce])

  const shipId = report?.decision?.action === 'ship_variant' ? report.decision.variantId : report?.status === 'winner' ? report.winnerId : null
  const winner = report && shipId ? report.variants.find((v) => v.id === shipId) : undefined

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-violet-400" />
          <h3 className="font-semibold text-lg text-white">Experiment significance</h3>
        </div>
        <div className="flex gap-2 text-xs">
          <select aria-label="Window" value={days} onChange={(e) => { setLoading(true); setDays(Number(e.target.value)) }} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200">
            {[7, 14, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <select aria-label="Confidence" value={confidence} onChange={(e) => { setLoading(true); setConfidence(Number(e.target.value)) }} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200">
            {[0.9, 0.95, 0.99].map((c) => <option key={c} value={c}>{pct(c, 0)} confidence</option>)}
          </select>
        </div>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      {report && !error && (
        <>
          <p className="mt-3 text-sm text-slate-300">{report.note}</p>
          {report.decision && (
            <div role="status" data-decision={report.decision.action} className={`mt-3 rounded-xl border px-4 py-3 text-sm ${report.decision.action === 'ship_variant' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : report.decision.action === 'keep_running' ? 'border-slate-700 bg-slate-950/60 text-slate-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
              <span className="font-semibold">{{ keep_running: 'Keep running', ship_variant: 'Ship the winner', keep_control: 'Keep the control', stop_no_effect: 'Stop: no effect' }[report.decision.action]}.</span>{' '}
              {report.decision.reason}
            </div>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-slate-500">
                <tr><th className="py-2 pr-4">Variant</th><th className="pr-4">Clicks</th><th className="pr-4">Conv.</th><th className="pr-4">Rate (95% CI)</th><th className="pr-4">Lift</th><th className="pr-4">Confidence</th><th className="pr-4" title="Bayesian probability this variant beats the control">P(beat control)</th><th title="Expected conversion-rate points lost if you ship this variant">Exp. loss</th></tr>
              </thead>
              <tbody>
                {report.variants.map((v) => (
                  <tr key={v.id} className="border-t border-slate-800">
                    <td className="py-2 pr-4 font-medium text-slate-100">{v.name}{v.isControl ? ' (control)' : ''}</td>
                    <td className="pr-4">{v.clicks.toLocaleString()}</td>
                    <td className="pr-4">{v.conversions.toLocaleString()}</td>
                    <td className="pr-4">{pct(v.rate)} <span className="text-slate-500">({pct(v.ci[0], 1)}–{pct(v.ci[1], 1)})</span></td>
                    <td className={`pr-4 ${v.lift === null ? '' : v.lift >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{v.lift === null ? '—' : `${v.lift >= 0 ? '+' : ''}${(v.lift * 100).toFixed(1)}%`}</td>
                    <td className="pr-4">{v.confidence === null ? '—' : pct(v.confidence, 1)}{v.significant ? ' ✓' : ''}</td>
                    {(() => {
                      const b = report.bayesian?.find((x) => x.id === v.id)
                      return (
                        <>
                          <td className="pr-4">{b?.probBeatControl == null ? '—' : pct(b.probBeatControl, 1)}</td>
                          <td>{b && !v.isControl ? pct(b.expectedLoss, 3) : '—'}</td>
                        </>
                      )
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {winner && !winner.isControl && (
            <button onClick={() => void onPromoteWinner(winner.id, { requireWinner: report?.status === 'winner' }).then(() => setNonce((n) => n + 1))} className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-400">
              Promote “{winner.name}” to default URL
            </button>
          )}
        </>
      )}
    </section>
  )
}
