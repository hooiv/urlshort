'use client'

import { useEffect, useState } from 'react'
import { Tags } from 'lucide-react'
import type { UtmCoverageLink } from '@/lib/utm-coverage'

type Report = { totalLinks: number; tagged: number; coveragePercent: number; truncated: boolean; links: UtmCoverageLink[] }

export default function UtmCoveragePage() {
  const [report, setReport] = useState<Report | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [utm, setUtm] = useState({ utm_source: '', utm_medium: '', utm_campaign: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/analytics/utm-coverage?limit=200')
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setReport(body); setSelected(new Set()); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [tick])

  function toggle(code: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n })
  }

  async function apply() {
    const values = Object.fromEntries(Object.entries(utm).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]))
    if (selected.size === 0 || Object.keys(values).length === 0) return
    setBusy(true)
    try {
      const r = await fetch('/api/bulk/edit', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: [...selected], changes: { utm: values } }),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Update failed')
      setTick((t) => t + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold"><Tags size={20} /> UTM coverage</h1>
      {report && <p className="mb-4 text-sm opacity-80">{report.coveragePercent}% of {report.totalLinks} active links carry utm_source, utm_medium and utm_campaign.</p>}
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {report && report.links.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {(['utm_source', 'utm_medium', 'utm_campaign'] as const).map((k) => (
            <input key={k} value={utm[k]} maxLength={120} placeholder={k} aria-label={k} onChange={(e) => setUtm((u) => ({ ...u, [k]: e.target.value }))} className="rounded border px-2 py-1" />
          ))}
          <button type="button" disabled={busy || selected.size === 0} onClick={() => void apply()} className="ml-auto rounded border px-3 py-1 disabled:opacity-50">
            Apply to {selected.size || ''} selected
          </button>
        </div>
      )}
      {!report && !error ? <p className="text-sm opacity-70">Loading…</p> : report && report.links.length === 0 ? (
        <p className="text-sm opacity-70">Every active link is fully tagged.</p>
      ) : (
        <ul className="divide-y">
          {report?.links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <input type="checkbox" checked={selected.has(l.shortCode)} onChange={() => toggle(l.shortCode)} aria-label={`Select /${l.shortCode}`} />
              <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
              <span className="min-w-0 flex-1 truncate opacity-70">{l.originalUrl}</span>
              <span className="text-xs opacity-70">missing {l.missing.map((m) => m.replace('utm_', '')).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
      {report?.truncated && <p className="mt-3 text-xs opacity-70">Showing the first 200 links with gaps.</p>}
    </main>
  )
}
