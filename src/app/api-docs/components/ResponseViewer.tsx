'use client'

import { Copy } from 'lucide-react'
import { formatNumber } from '@/lib/format'
import type { PlaygroundResponse } from '@/app/api-docs/components/hooks/useApiPlayground'

interface ResponseViewerProps {
  result: PlaygroundResponse | null
  onCopy: (text: string) => void
}

/** Live response box with status pill, latency, and copyable JSON. */
export default function ResponseViewer({ result, onCopy }: ResponseViewerProps) {
  if (!result) return null
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              result.status < 400
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}
          >
            HTTP {result.status} {result.statusText}
          </span>
          <span className="text-xs text-slate-500">{formatNumber(result.latencyMs)}ms latency</span>
        </div>

        <button
          onClick={() => onCopy(JSON.stringify(result.data, null, 2))}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
        >
          <Copy className="h-3.5 w-3.5" /> Copy JSON
        </button>
      </div>

      <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-200">
        {JSON.stringify(result.data, null, 2)}
      </pre>
    </section>
  )
}
