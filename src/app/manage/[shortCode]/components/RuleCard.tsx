'use client'

import { Trash2 } from 'lucide-react'
import type { Rule } from '@/app/manage/[shortCode]/components/campaign-types'

interface RuleCardProps {
  rule: Rule
  onToggle: () => void
  onDelete: () => void
}

export default function RuleCard({ rule, onToggle, onDelete }: RuleCardProps) {
  const conditions = [
    rule.countryCodes ? `Geo: ${rule.countryCodes}` : null,
    rule.deviceType ? `Device: ${rule.deviceType}` : null,
    rule.trafficType ? `Traffic: ${rule.trafficType}` : null,
    rule.aiAgent ? `AI: ${rule.aiAgent}` : null,
    rule.os ? `OS: ${rule.os}` : null,
    rule.languageCodes ? `Lang: ${rule.languageCodes}` : null,
    rule.referrerDomain ? `Ref: ${rule.referrerDomain}` : null,
  ].filter(Boolean)

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
              P{rule.priority}
            </span>
            <span className="font-semibold text-sm text-slate-100">{rule.name}</span>
            <span className="font-mono text-xs text-slate-500">wt: {rule.weight}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                rule.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {rule.enabled ? 'Live' : 'Paused'}
            </span>
          </div>

          <div className="mt-2 truncate font-mono text-xs text-blue-400">{rule.destinationUrl}</div>

          {conditions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {conditions.map((cond) => (
                <span key={cond} className="rounded-full bg-slate-800/80 px-2.5 py-0.5 text-[10px] text-slate-400">
                  {cond}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={onToggle}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-700"
          >
            {rule.enabled ? 'Pause' : 'Enable'}
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
            title="Delete rule"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  )
}
