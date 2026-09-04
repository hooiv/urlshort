'use client'

import type { ShortenFormState } from '@/app/components/shorten-logic'

interface Props {
  form: ShortenFormState
  onChange: (update: Partial<ShortenFormState>) => void
  onPreset: (source: string, medium: string, campaign: string) => void
  disabled: boolean
}

const PRESETS: Array<[string, string, string, string]> = [
  ['Google Ads', 'google', 'cpc', 'search'],
  ['Meta / FB', 'facebook', 'paid_social', 'promo'],
  ['X / Twitter', 'twitter', 'social', 'launch'],
  ['Newsletter', 'newsletter', 'email', 'weekly'],
]

export default function UtmBuilder({ form, onChange, onPreset, disabled }: Props) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-300">Campaign UTM Presets:</span>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(([label, source, medium, campaign]) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => onPreset(source, medium, campaign)}
              className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={form.utmSource}
          onChange={(e) => onChange({ utmSource: e.target.value })}
          placeholder="utm_source (e.g. google)"
          disabled={disabled}
          className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
        />
        <input
          value={form.utmMedium}
          onChange={(e) => onChange({ utmMedium: e.target.value })}
          placeholder="utm_medium (e.g. cpc)"
          disabled={disabled}
          className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
        />
        <input
          value={form.utmCampaign}
          onChange={(e) => onChange({ utmCampaign: e.target.value })}
          placeholder="utm_campaign (e.g. summer)"
          disabled={disabled}
          className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
        />
      </div>
    </div>
  )
}
