'use client'

import { Save, ShieldCheck } from 'lucide-react'
import { clampRolloutPercent } from '@/app/flags/components/flags-logic'

interface Props {
  flagKey: string
  enabled: boolean
  rollout: number
  busy: boolean
  onKeyChange: (value: string) => void
  onEnabledChange: (value: boolean) => void
  onRolloutChange: (value: number) => void
  onSave: () => void
}

export default function FlagsEditor({
  flagKey,
  enabled,
  rollout,
  busy,
  onKeyChange,
  onEnabledChange,
  onRolloutChange,
  onSave,
}: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-emerald-400" />
        <span className="font-semibold">Create / update flag</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_180px_auto]">
        <input
          aria-label="Flag key"
          value={flagKey}
          onChange={(e) => onKeyChange(e.target.value)}
          placeholder="campaigns.autopilot"
          disabled={busy}
          className="rounded-xl border border-slate-700 bg-slate-950 p-3 disabled:opacity-50"
        />
        <label className="flex items-center gap-2 rounded-xl border border-slate-700 px-3">
          <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} disabled={busy} />
          Enabled
        </label>
        <label className="rounded-xl border border-slate-700 px-3 py-2">
          Rollout %
          <input
            aria-label="Rollout percentage"
            type="number"
            min="0"
            max="100"
            step="1"
            value={rollout}
            onChange={(e) => onRolloutChange(clampRolloutPercent(Number(e.target.value)))}
            disabled={busy}
            className="ml-2 w-20 bg-transparent disabled:opacity-50"
          />
        </label>
        <button
          disabled={busy || !flagKey.trim()}
          onClick={onSave}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 font-semibold disabled:opacity-50"
        >
          <Save size={16} /> Save
        </button>
      </div>
    </div>
  )
}
