'use client'

import { useEffect, useState } from 'react'
import { Archive } from 'lucide-react'
import { STALE_DAYS_OPTIONS, type StaleLink } from '@/lib/stale-links'

export default function StaleLinksPage() {
  const [days, setDays] = useState<number>(90)
  const [links, setLinks] = useState<StaleLink[]>([])
  const [truncated, setTruncated] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/analytics/stale?days=${days}&limit=200`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setLinks(body.links ?? []); setTruncated(Boolean(body.truncated)); setSelected(new Set()); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [days, tick])

  function toggle(code: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n })
  }

  async function archive() {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const r = await fetch('/api/bulk/edit', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: [...selected], changes: { archived: true } }),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Archive failed')
      setTick((t) => t + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold"><Archive size={20} /> Stale links</h1>
      <div className="mb-3 flex items-center gap-3 text-sm">
        <label>No human clicks for{' '}
          <select value={days} onChange={(e) => { setLoading(true); setDays(Number(e.target.value)) }} className="rounded border px-2 py-1">
            {STALE_DAYS_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <button type="button" disabled={busy || selected.size === 0} onClick={() => void archive()} className="ml-auto rounded border px-3 py-1 disabled:opacity-50">
          Archive {selected.size || ''} selected
        </button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">Every active link has had a click in the last {days} days.</p>
      ) : (
        <ul className="divide-y">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <input type="checkbox" checked={selected.has(l.shortCode)} onChange={() => toggle(l.shortCode)} aria-label={`Select /${l.shortCode}`} />
              <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
              <span className="min-w-0 flex-1 truncate opacity-70">{l.originalUrl}</span>
              <span className="text-xs opacity-70">{l.lastClickAt ? `idle ${l.idleDays}d` : `never clicked, ${l.idleDays}d old`}</span>
            </li>
          ))}
        </ul>
      )}
      {truncated && <p className="mt-3 text-xs opacity-70">Showing the 200 most idle links. Archive some and reload for more.</p>}
    </main>
  )
}
