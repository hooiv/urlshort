'use client'

import toast from 'react-hot-toast'
import Field from '@/app/manage/[shortCode]/components/Field'
import { copyText } from '@/app/manage/[shortCode]/components/campaign-utils'

interface UtmBuilderProps {
  utmSource: string
  utmMedium: string
  utmCampaign: string
  onUtmSourceChange: (value: string) => void
  onUtmMediumChange: (value: string) => void
  onUtmCampaignChange: (value: string) => void
  generatedUtmUrl: string
  onPreset: (source: string, medium: string, campaign: string) => void
}

const presets = [
  { label: 'Google Ads', source: 'google', medium: 'cpc', campaign: 'search_campaign' },
  { label: 'Meta / FB', source: 'facebook', medium: 'paid_social', campaign: 'retargeting' },
  { label: 'X (Twitter)', source: 'twitter', medium: 'social', campaign: 'launch_post' },
  { label: 'Newsletter', source: 'newsletter', medium: 'email', campaign: 'weekly_roundup' },
]

export default function UtmBuilder({
  utmSource,
  utmMedium,
  utmCampaign,
  onUtmSourceChange,
  onUtmMediumChange,
  onUtmCampaignChange,
  generatedUtmUrl,
  onPreset,
}: UtmBuilderProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-white">UTM Parameter Studio</h2>
          <p className="mt-1 text-xs text-slate-400">
            Generate tracking variants with instant presets for advertising and social campaigns.
          </p>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => onPreset(preset.source, preset.medium, preset.campaign)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Field label="Source (utm_source)">
          <input
            value={utmSource}
            onChange={(e) => onUtmSourceChange(e.target.value)}
            placeholder="e.g. google, twitter"
            className="input"
          />
        </Field>
        <Field label="Medium (utm_medium)">
          <input
            value={utmMedium}
            onChange={(e) => onUtmMediumChange(e.target.value)}
            placeholder="e.g. cpc, email, social"
            className="input"
          />
        </Field>
        <Field label="Campaign (utm_campaign)">
          <input
            value={utmCampaign}
            onChange={(e) => onUtmCampaignChange(e.target.value)}
            placeholder="e.g. summer_promo"
            className="input"
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3.5">
        <code className="flex-1 overflow-x-auto text-xs font-mono text-blue-300 whitespace-nowrap">
          {generatedUtmUrl}
        </code>
        <button
          onClick={() => {
            void copyText(generatedUtmUrl).then((ok) => {
              toast.success(ok ? 'Campaign link copied!' : 'Copy failed — select the link manually')
            })
          }}
          className="shrink-0 rounded-lg bg-blue-500/10 border border-blue-500/30 px-3.5 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-500/20"
        >
          Copy Campaign URL
        </button>
      </div>
    </section>
  )
}
