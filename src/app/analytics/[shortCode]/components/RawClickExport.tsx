'use client'

import { useMemo, useState } from 'react'

/** Builds the streaming raw-click export URL; empty dates are omitted. */
export function buildClickExportHref(shortCode: string, format: 'csv' | 'ndjson', from: string, to: string): string {
  const q = new URLSearchParams({ format })
  if (from) q.set('from', from)
  if (to) q.set('to', to)
  return `/api/analytics/${encodeURIComponent(shortCode)}/clicks?${q.toString()}`
}

export default function RawClickExport({ shortCode }: { shortCode: string }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const invalid = Boolean(from && to && from > to)
  const csv = useMemo(() => buildClickExportHref(shortCode, 'csv', from, to), [shortCode, from, to])
  const nd = useMemo(() => buildClickExportHref(shortCode, 'ndjson', from, to), [shortCode, from, to])
  const btn = 'rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20'
  return (
    <section className="rounded-2xl border border-white/10 p-5">
      <h3 className="text-sm font-semibold text-white">Raw click export</h3>
      <p className="mt-1 text-xs text-slate-400">Every click event, streamed. Leave dates empty for all time.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white" />
        <input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white" />
        {invalid ? (
          <span className="text-xs text-red-400">Start date must be before end date.</span>
        ) : (
          <>
            <a href={csv} className={btn} download>CSV</a>
            <a href={nd} className={btn} download>NDJSON</a>
          </>
        )}
      </div>
    </section>
  )
}
