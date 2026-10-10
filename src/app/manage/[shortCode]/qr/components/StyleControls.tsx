'use client'

import { Shapes } from 'lucide-react'
import { isValidHexColor, QR_DOT_STYLES, QR_EYE_STYLES, type QrDotStyle, type QrEyeStyle } from './qrOptions'

const LABEL: Record<string, string> = { square: 'Square', rounded: 'Rounded', dots: 'Dots', circle: 'Circle' }

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="block text-xs font-medium text-slate-400 mb-1.5">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${value === o ? 'border-blue-500 bg-blue-500/10 text-blue-200' : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'}`}
          >
            {LABEL[o]}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function StyleControls({ dots, eyes, gradientEnd, onDots, onEyes, onGradientEnd }: {
  dots: QrDotStyle
  eyes: QrEyeStyle
  gradientEnd: string
  onDots: (v: QrDotStyle) => void
  onEyes: (v: QrEyeStyle) => void
  onGradientEnd: (v: string) => void
}) {
  const invalid = gradientEnd !== '' && !isValidHexColor(gradientEnd)
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div className="flex items-center gap-2 text-white font-semibold">
        <Shapes className="h-4 w-4 text-blue-400" />
        <span>Pattern Style</span>
      </div>
      <Segmented label="Module shape" value={dots} options={QR_DOT_STYLES} onChange={onDots} />
      <Segmented label="Corner eyes" value={eyes} options={QR_EYE_STYLES} onChange={onEyes} />
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="qr-gradient-end">Gradient end color (optional)</label>
        <input
          id="qr-gradient-end"
          type="text"
          placeholder="#2563eb"
          value={gradientEnd}
          onChange={(e) => onGradientEnd(e.target.value.trim())}
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-blue-500"
        />
        {invalid && <p className="mt-1 text-[11px] text-amber-400">Enter a 6-digit hex color like #2563EB.</p>}
      </div>
    </section>
  )
}
