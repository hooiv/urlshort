'use client'

import { CheckCircle2, TriangleAlert } from 'lucide-react'
import type { Campaign } from './types'

export function DecisionCenter({ campaign }: { campaign: Campaign }) {
  const decisions = campaign.decisions ?? []
  const anomalies = campaign.anomalies ?? []
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section>
        <h4 className="text-sm font-semibold text-white">Decision trail</h4>
        <p className="mt-1 text-xs text-slate-500">
          Every automated allocation change is retained with its evidence and actor.
        </p>
        <div className="mt-4 space-y-2">
          {decisions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 p-5 text-xs text-slate-600">
              No decisions yet. Start the campaign to begin the experiment trail.
            </p>
          ) : (
            decisions
              .slice(0, 8)
              .map((decision) => (
                <div key={decision.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-slate-200">
                        {decision.action.replaceAll('_', ' ')}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{decision.reason}</p>
                    </div>
                    {decision.confidenceBps != null && (
                      <span className="rounded-md bg-blue-500/10 px-2 py-1 font-mono text-[11px] text-blue-300">
                        {(decision.confidenceBps / 100).toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-wider text-slate-700">
                    {decision.actorType} · {new Date(decision.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
          )}
        </div>
      </section>
      <section>
        <h4 className="text-sm font-semibold text-white">Reliability signals</h4>
        <p className="mt-1 text-xs text-slate-500">
          Anomalies stay visible until the signal recovers below the recovery boundary.
        </p>
        <div className="mt-4 space-y-2">
          {anomalies.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 p-5 text-xs text-slate-600">
              No anomalies recorded.
            </p>
          ) : (
            anomalies.slice(0, 8).map((anomaly) => (
              <div key={anomaly.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200">
                    {anomaly.severity === 'critical' || anomaly.severity === 'warning' ? (
                      <TriangleAlert className="h-3.5 w-3.5 text-amber-400" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    )}
                    {anomaly.type.replaceAll('_', ' ')}
                  </span>
                  <span className="text-[11px] text-slate-600">
                    {anomaly.resolvedAt ? 'Recovered' : 'Active'}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>{anomaly.metric}</span>
                  <span>
                    {anomaly.observed.toFixed(0)} vs {anomaly.baseline.toFixed(0)} baseline
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-600">
                  {anomaly.deviation.toFixed(2)}σ · {new Date(anomaly.startedAt).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
