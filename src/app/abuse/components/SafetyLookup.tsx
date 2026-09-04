'use client'

import { Search } from 'lucide-react'

/** Interactive safety-lookup form (pure input + submit; results render separately). */
export function SafetyLookup({
  value,
  onChange,
  scanning,
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  scanning: boolean
  onSubmit: (event: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="flex gap-3">
      <label htmlFor="abuse-scan-input" className="sr-only">
        Link URL or short code to verify
      </label>
      <input
        id="abuse-scan-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste link URL or code (e.g. quicklink.to/abc1234)"
        autoComplete="off"
        spellCheck={false}
        maxLength={512}
        className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono"
      />
      <button
        type="submit"
        disabled={scanning}
        className="rounded-xl bg-blue-500 px-5 py-3 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-60 transition shadow-lg shadow-blue-500/20"
      >
        {scanning ? 'Scanning…' : 'Verify Link Safety'}
      </button>
    </form>
  )
}

export function SafetyLookupHeader() {
  return (
    <div className="flex items-center gap-2 text-white font-semibold text-base">
      <Search className="h-4 w-4 text-blue-400" />
      <span>Instant Safety Lookup</span>
    </div>
  )
}
