'use client'

import { Sparkles } from 'lucide-react'

export default function HeroSection() {
  return (
    <section className="text-center space-y-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-300">
        <Sparkles className="h-3.5 w-3.5 text-blue-400" />
        Campaign-Grade Link Infrastructure
      </div>
      <h1 className="mx-auto max-w-4xl text-5xl font-bold tracking-tight text-white sm:text-6xl">
        One permanent short code. <br />
        <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
          Infinite intelligent routes.
        </span>
      </h1>
      <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
        Route visitors dynamically by country, device OS, referrer, or time window. Run deterministic A/B split tests, track full-funnel conversions, and automate failover.
      </p>
    </section>
  )
}
