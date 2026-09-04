'use client'

import { Sparkles } from 'lucide-react'
import { LOGO_OPTIONS } from './qrOptions'

export default function LogoControls({
  selectedLogo,
  onSelect,
}: {
  selectedLogo: string
  onSelect: (logoId: string) => void
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex items-center gap-2 text-white font-semibold mb-2">
        <Sparkles className="h-4 w-4 text-amber-400" />
        <span>Center Logo Badge</span>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Embed a brand icon in the center of the QR matrix with high error correction.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {LOGO_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className={`rounded-xl border p-2.5 text-center text-xs font-medium transition ${
              selectedLogo === opt.id
                ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  )
}
