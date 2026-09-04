'use client'

import { Sparkles } from 'lucide-react'

export default function StudioBanner() {
  return (
    <section className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
        <Sparkles className="h-4 w-4" /> Link Infrastructure Operating Console
      </div>
      <h1 className="mt-2 text-2xl font-bold text-white">Dynamic routing, releases, and audience intelligence.</h1>
      <p className="mt-2 text-sm text-slate-400">
        One permanent short code with multi-variant split tests, automated failovers, retargeting pixels, and live social card customization.
      </p>
    </section>
  )
}
