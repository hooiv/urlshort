'use client'

import type { PreviewInput, PreviewResult } from '@/app/manage/[shortCode]/components/campaign-types'

interface RoutingSimulatorProps {
  preview: PreviewInput
  onPreviewChange: (preview: PreviewInput) => void
  busy: boolean
  result: PreviewResult | null
  onEvaluate: () => void
}

export default function RoutingSimulator({ preview, onPreviewChange, busy, result, onEvaluate }: RoutingSimulatorProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-white">Routing Simulator</h2>
          <p className="mt-1 text-xs text-slate-400">Test an audience before publishing a campaign. This never records a click or changes traffic.</p>
        </div>
        <span className="rounded-full bg-violet-500/10 px-3 py-1 text-[11px] font-semibold text-violet-300">SAFE PREVIEW</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <input className="input" value={preview.country} onChange={(e) => onPreviewChange({ ...preview, country: e.target.value })} placeholder="US" aria-label="Country" />
        <select className="input" value={preview.deviceType} onChange={(e) => onPreviewChange({ ...preview, deviceType: e.target.value })} aria-label="Device">
          <option value="desktop">Desktop</option><option value="mobile">Mobile</option><option value="tablet">Tablet</option><option value="bot">Bot</option>
        </select>
        <select className="input" value={preview.os} onChange={(e) => onPreviewChange({ ...preview, os: e.target.value })} aria-label="Operating system">
          <option value="windows">Windows</option><option value="ios">iOS</option><option value="android">Android</option><option value="macos">macOS</option><option value="linux">Linux</option><option value="chromeos">ChromeOS</option>
        </select>
        <input className="input" value={preview.language} onChange={(e) => onPreviewChange({ ...preview, language: e.target.value })} placeholder="en" aria-label="Language" />
        <select className="input" value={preview.trafficType} onChange={(e) => onPreviewChange({ ...preview, trafficType: e.target.value })} aria-label="Traffic class">
          <option value="human">Human</option><option value="ai_agent">AI agent</option><option value="bot">Bot</option>
        </select>
        <input className="input" value={preview.aiAgent} onChange={(e) => onPreviewChange({ ...preview, aiAgent: e.target.value })} placeholder="AI agent (optional)" aria-label="AI agent" />
        <button disabled={busy} onClick={onEvaluate} className="rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-50">
          {busy ? 'Evaluating…' : 'Evaluate'}
        </button>
      </div>
      <div className="mt-3">
        <input
          className="input"
          value={preview.referrerHost}
          onChange={(e) => onPreviewChange({ ...preview, referrerHost: e.target.value })}
          placeholder="Referrer host (optional, e.g. instagram.com)"
          aria-label="Referrer host"
        />
      </div>
      {result && (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Decision</div>
              <div className="mt-1 text-sm font-semibold text-white">{result.matchedRule ? `Rule: ${result.matchedRule.name}` : 'Fallback destination'}</div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${result.fallback ? 'bg-slate-800 text-slate-400' : 'bg-emerald-500/10 text-emerald-300'}`}>
              {result.fallback ? 'NO RULE MATCH' : 'RULE MATCH'}
            </span>
          </div>
          <div className="mt-3 truncate font-mono text-xs text-blue-300">{result.destination}</div>
        </div>
      )}
    </section>
  )
}
