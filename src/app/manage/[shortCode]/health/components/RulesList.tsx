'use client'

import { Activity, RefreshCw } from 'lucide-react'
import { StatusPill } from './StatusPill'
import type { RuleHealth } from './types'

function RuleHealthCard({
  rule,
  checking,
  onCheck,
}: {
  rule: RuleHealth
  checking: boolean
  onCheck: () => void
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusPill status={rule.healthStatus} />
            <span className="font-semibold text-sm text-slate-200 truncate">{rule.name}</span>
          </div>
          <p className="mt-1.5 truncate font-mono text-xs text-blue-400">{rule.destinationUrl}</p>
          <div className="mt-2 text-[11px] text-slate-500">
            {rule.healthCheckedAt
              ? `${new Date(rule.healthCheckedAt).toLocaleTimeString()} · ${
                  rule.healthLatencyMs ?? '—'
                }ms · HTTP ${rule.healthStatusCode || '—'}`
              : 'Never probed'}
          </div>
        </div>

        <button
          onClick={onCheck}
          disabled={checking}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-700 disabled:opacity-50 transition"
        >
          <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Probing…' : 'Probe'}
        </button>
      </div>
    </div>
  )
}

export default function RulesList({
  rules,
  checking,
  onCheck,
}: {
  rules: RuleHealth[]
  checking: string | null
  onCheck: (ruleId: string) => void
}) {
  const enabled = rules.filter((r) => r.enabled)
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-white text-base">
          <Activity className="h-5 w-5 text-blue-400" />
          <span>Routing Rule Targets</span>
        </div>
        <span className="text-xs font-mono text-slate-500">
          {enabled.length} Enabled
        </span>
      </div>
      <p className="text-xs text-slate-400">
        Unhealthy rule variants are automatically skipped during traffic evaluation until recovery.
      </p>

      <div className="space-y-3">
        {enabled.map((rule) => (
          <RuleHealthCard
            key={rule.id}
            rule={rule}
            checking={checking === rule.id}
            onCheck={() => onCheck(rule.id)}
          />
        ))}
        {!enabled.length && (
          <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
            No active routing rules configured.
          </div>
        )}
      </div>
    </div>
  )
}
