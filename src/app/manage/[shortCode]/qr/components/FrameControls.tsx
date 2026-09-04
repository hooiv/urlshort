'use client'

import { Layers } from 'lucide-react'
import { FRAME_TEXT_MAX_LENGTH } from './qrOptions'

export default function FrameControls({
  showFrame,
  frameText,
  onToggleShowFrame,
  onFrameText,
}: {
  showFrame: boolean
  frameText: string
  onToggleShowFrame: (value: boolean) => void
  onFrameText: (value: string) => void
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Layers className="h-4 w-4 text-emerald-400" />
          <span>Call-to-Action Frame</span>
        </div>
        <input
          type="checkbox"
          checked={showFrame}
          onChange={(e) => onToggleShowFrame(e.target.checked)}
          className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-500"
        />
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Surround the QR code with an eye-catching CTA frame for physical flyers or social banners.
      </p>

      {showFrame && (
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Frame Text</label>
          <input
            type="text"
            value={frameText}
            onChange={(e) => onFrameText(e.target.value)}
            placeholder="SCAN WITH CAMERA"
            maxLength={FRAME_TEXT_MAX_LENGTH}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-100 outline-none focus:border-blue-500"
          />
        </div>
      )}
    </section>
  )
}
