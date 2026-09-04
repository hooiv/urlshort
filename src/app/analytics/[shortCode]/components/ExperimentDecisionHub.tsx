'use client'

import { Trophy } from 'lucide-react'
import { formatNumber } from '@/lib/format'
import type { AnalyticsData } from './types'

export default function ExperimentDecisionHub({
  analysis,
  onPromoteWinner,
}: {
  analysis: AnalyticsData['analytics']['experimentAnalysis']
  onPromoteWinner: (ruleId: string) => Promise<void>
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400" />
            <h3 className="font-semibold text-lg text-white">A/B Testing & Statistical Inference</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">{analysis.summary}</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {analysis.results.map((res) => {
          const isWinner = res.isSignificantWinner
          const isControl = res.status === 'control'

          return (
            <div
              key={res.variantId}
              className={`rounded-xl border p-4 transition ${
                isWinner
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : isControl
                  ? 'border-slate-700/60 bg-slate-950'
                  : 'border-slate-800 bg-slate-950'
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-200">{res.name}</span>
                    {isControl && (
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                        CONTROL
                      </span>
                    )}
                    {isWinner && (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        <Trophy className="h-3 w-3" />
                        WINNER (95% CONFIDENCE)
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                    <div>
                      <span>Clicks: </span>
                      <strong className="text-slate-200">{formatNumber(res.clicks)}</strong>
                    </div>
                    <div>
                      <span>Conversions: </span>
                      <strong className="text-slate-200">{formatNumber(res.conversions)}</strong>
                    </div>
                    <div>
                      <span>CVR: </span>
                      <strong className="text-blue-300">{(res.conversionRate * 100).toFixed(2)}%</strong>
                    </div>
                    {!isControl && (
                      <div>
                        <span>Uplift: </span>
                        <strong className={res.relativeUplift >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {res.relativeUplift >= 0 ? '+' : ''}
                          {(res.relativeUplift * 100).toFixed(1)}%
                        </strong>
                      </div>
                    )}
                    {!isControl && (
                      <div>
                        <span>Chance to beat control: </span>
                        <strong className="text-violet-300">
                          {(res.bayesianProbabilityToBeatControl * 100).toFixed(0)}%
                        </strong>
                      </div>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-slate-500">{res.recommendation}</p>
                </div>

                {isWinner && (
                  <button
                    onClick={() => void onPromoteWinner(res.variantId)}
                    className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
                  >
                    Promote to Default URL
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
