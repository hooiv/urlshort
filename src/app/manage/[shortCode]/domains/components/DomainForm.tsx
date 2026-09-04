'use client'

import type { FormEvent } from 'react'

export default function DomainForm({
  host,
  path,
  working,
  shortCode,
  onHostChange,
  onPathChange,
  onSubmit,
}: {
  host: string
  path: string
  working: boolean
  shortCode: string
  onHostChange: (value: string) => void
  onPathChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Connect New Branded Domain</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Enter your subdomain or apex domain and the custom backhalf path.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_220px_auto]">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Hostname</label>
          <input
            required
            value={host}
            onChange={(e) => onHostChange(e.target.value)}
            placeholder="e.g. go.yourcompany.com"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Path</label>
          <input
            required
            value={path}
            onChange={(e) => onPathChange(e.target.value)}
            placeholder={`/${shortCode}`}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono"
          />
        </div>

        <div className="flex items-end">
          <button
            disabled={working}
            className="w-full sm:w-auto rounded-xl bg-blue-500 px-6 py-3 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-400 disabled:opacity-60 transition"
          >
            {working ? 'Processing…' : 'Connect Domain'}
          </button>
        </div>
      </form>
    </section>
  )
}
