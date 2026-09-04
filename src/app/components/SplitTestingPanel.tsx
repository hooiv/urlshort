'use client'

import type { SplitRuleInput } from '@/app/components/shorten-logic'

interface Props {
  rules: SplitRuleInput[]
  disabled: boolean
  onAdd: () => void
  onUpdate: (index: number, update: Partial<SplitRuleInput>) => void
  onRemove: (id: number) => void
}

export default function SplitTestingPanel({ rules, disabled, onAdd, onUpdate, onRemove }: Props) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between">
        <label className="block text-xs text-slate-400">Destination URLs (A/B Test)</label>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="text-xs text-blue-400 hover:text-blue-300 font-medium disabled:opacity-50"
        >
          + Add Variant
        </button>
      </div>
      <div className="space-y-3">
        {rules.map((rule, idx) => (
          <div key={rule.id} className="flex gap-3 items-center">
            <div className="flex-1">
              <input
                type="url"
                value={rule.url}
                onChange={(e) => onUpdate(idx, { url: e.target.value })}
                placeholder="https://example.com/variant-b"
                disabled={disabled}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
              />
            </div>
            <div className="w-24">
              <input
                type="number"
                value={rule.weight}
                onChange={(e) => onUpdate(idx, { weight: Number(e.target.value) })}
                placeholder="Weight %"
                min="0"
                max="1000"
                step="1"
                disabled={disabled}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => onRemove(rule.id)}
              disabled={disabled}
              aria-label="Remove variant"
              className="text-slate-500 hover:text-red-400 p-2 disabled:opacity-50"
            >
              ×
            </button>
          </div>
        ))}
        {rules.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">
            No variants added. The default destination will receive 100% of traffic.
          </p>
        )}
      </div>
    </div>
  )
}
