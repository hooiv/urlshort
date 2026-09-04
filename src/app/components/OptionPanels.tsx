'use client'

import type { ShortenFormState } from '@/app/components/shorten-logic'

interface Props {
  form: ShortenFormState
  onChange: (update: Partial<ShortenFormState>) => void
  disabled: boolean
}

export function SecurityLimitsPanel({ form, onChange, disabled }: Props) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Password Protection</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => onChange({ password: e.target.value })}
            placeholder="Leave empty for public"
            disabled={disabled}
            autoComplete="new-password"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Max Clicks Limit</label>
          <input
            type="number"
            value={form.maxClicks}
            onChange={(e) => onChange({ maxClicks: e.target.value })}
            placeholder="e.g. 100"
            min="1"
            step="1"
            disabled={disabled}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Expiration Date</label>
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => onChange({ expiresAt: e.target.value })}
            disabled={disabled}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Expiration Redirect URL</label>
          <input
            type="url"
            value={form.expiredUrl}
            onChange={(e) => onChange({ expiredUrl: e.target.value })}
            placeholder="https://example.com/expired"
            disabled={disabled}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
          />
        </div>
      </div>
    </div>
  )
}

export function SocialGraphPanel({ form, onChange, disabled }: Props) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div>
        <label className="mb-1 block text-xs text-slate-400">Social Card Description (OG Description)</label>
        <textarea
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={2}
          placeholder="Summary shown when shared on Twitter, Facebook, LinkedIn, or Slack"
          disabled={disabled}
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500 resize-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-400">Social Card Image URL (OG Image)</label>
        <input
          type="url"
          value={form.ogImage}
          onChange={(e) => onChange({ ogImage: e.target.value })}
          placeholder="https://example.com/social-card.png"
          disabled={disabled}
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
        />
      </div>
    </div>
  )
}

export function TrackingPixelsPanel({ form, onChange, disabled }: Props) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Meta/Facebook Pixel ID</label>
          <input
            type="text"
            value={form.metaPixelId}
            onChange={(e) => onChange({ metaPixelId: e.target.value })}
            placeholder="e.g. 1234567890"
            disabled={disabled}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Google Tag ID</label>
          <input
            type="text"
            value={form.googleTagId}
            onChange={(e) => onChange({ googleTagId: e.target.value })}
            placeholder="e.g. G-XXXXXXX"
            disabled={disabled}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">X/Twitter Pixel ID</label>
          <input
            type="text"
            value={form.xPixelId}
            onChange={(e) => onChange({ xPixelId: e.target.value })}
            placeholder="e.g. n1234"
            disabled={disabled}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.cloaked}
              onChange={(e) => onChange({ cloaked: e.target.checked })}
              disabled={disabled}
              className="rounded border-slate-800 bg-slate-950 text-blue-500 focus:ring-blue-500/50"
            />
            Enable Link Cloaking (iFrame)
          </label>
        </div>
      </div>
    </div>
  )
}
