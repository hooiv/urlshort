'use client'

import Field from '@/app/manage/[shortCode]/components/Field'

interface PixelsCloakingSectionProps {
  metaPixelId: string
  googleTagId: string
  xPixelId: string
  onMetaPixelIdChange: (value: string) => void
  onGoogleTagIdChange: (value: string) => void
  onXPixelIdChange: (value: string) => void
  cloaked: boolean
  onToggleCloaking: (enabled: boolean) => void
  onSave: () => void
}

export default function PixelsCloakingSection({
  metaPixelId,
  googleTagId,
  xPixelId,
  onMetaPixelIdChange,
  onGoogleTagIdChange,
  onXPixelIdChange,
  cloaked,
  onToggleCloaking,
  onSave,
}: PixelsCloakingSectionProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="font-semibold text-white">Retargeting & Link Cloaking</h2>
      <p className="mt-1 text-xs text-slate-400">
        Fire tracking pixels before redirecting or mask destination in an iframe.
      </p>

      <div className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Meta Pixel ID">
            <input
              value={metaPixelId}
              onChange={(e) => onMetaPixelIdChange(e.target.value)}
              placeholder="1234567890"
              className="input"
            />
          </Field>
          <Field label="Google Tag ID">
            <input
              value={googleTagId}
              onChange={(e) => onGoogleTagIdChange(e.target.value)}
              placeholder="G-XXXXXX"
              className="input"
            />
          </Field>
          <Field label="X Pixel ID">
            <input
              value={xPixelId}
              onChange={(e) => onXPixelIdChange(e.target.value)}
              placeholder="abcde"
              className="input"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div>
            <div className="text-xs font-semibold text-slate-200">Link Cloaking (iFrame Masking)</div>
            <div className="text-[11px] text-slate-500">Hides destination URL from visitor address bar</div>
          </div>
          <input
            type="checkbox"
            checked={cloaked}
            onChange={(e) => onToggleCloaking(e.target.checked)}
            className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-500"
          />
        </div>

        <button
          onClick={onSave}
          className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
        >
          Save Pixel IDs
        </button>
      </div>
    </div>
  )
}
