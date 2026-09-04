'use client'

import { BarChart3, ShieldCheck, Zap } from 'lucide-react'
import type { ReactNode } from 'react'

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/80">
        {icon}
      </div>
      <h3 className="font-semibold text-white text-base">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{text}</p>
    </article>
  )
}

export default function FeatureGrid() {
  return (
    <section className="mx-auto mt-20 grid max-w-5xl gap-6 md:grid-cols-3">
      <Feature
        icon={<Zap className="h-5 w-5 text-amber-400" />}
        title="Multi-Dimensional Routing"
        text="Route by ISO country, mobile OS (iOS/Android), referrer domain, or time window with automated health failover."
      />
      <Feature
        icon={<BarChart3 className="h-5 w-5 text-blue-400" />}
        title="Statistical A/B Testing"
        text="Run sticky deterministic weighted experiments with Bayesian probability and 95% Wilson confidence intervals."
      />
      <Feature
        icon={<ShieldCheck className="h-5 w-5 text-emerald-400" />}
        title="Private Security Console"
        text="Private token hashing, SSRF destination defense, HMAC conversion tokens, and signed real-time webhooks."
      />
    </section>
  )
}
