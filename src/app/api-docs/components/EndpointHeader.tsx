import { KeyRound } from 'lucide-react'
import { METHOD_COLORS } from '@/app/api-docs/components/apiCatalog'
import type { EndpointSpec } from '@/app/api-docs/components/apiCatalog'

/** Active endpoint title card, including non-standard auth callouts. */
export default function EndpointHeader({ endpoint }: { endpoint: EndpointSpec }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-bold ${
            METHOD_COLORS[endpoint.method]
          }`}
        >
          {endpoint.method}
        </span>
        <code className="font-mono text-sm font-semibold text-white">{endpoint.path}</code>
      </div>
      <h1 className="mt-3 text-xl font-bold text-white">{endpoint.title}</h1>
      <p className="mt-1 text-sm text-slate-400">{endpoint.description}</p>
      {endpoint.authNote && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{endpoint.authNote}</span>
        </p>
      )}
    </section>
  )
}
