'use client'

import { useEffect, useState } from 'react'
import { MousePointerClick } from 'lucide-react'
import type { NeverClickedLink } from '@/lib/never-clicked-links'

const AGES = [0, 7, 30, 90]

export default function NeverClickedLinksPage() {
  const [links, setLinks] = useState<NeverClickedLink[]>([])
  const [total, setTotal] = useState(0)
  const [minAge, setMinAge] = useState(7)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/links/never-clicked?limit=100&minAgeDays=${minAge}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setLinks(body.links ?? []); setTotal(body.total ?? 0); setSelected(new Set()); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tick, minAge])

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
      setTick((n) => n + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><MousePointerClick size={20} /> Never-clicked links</h1>
      <p className="mb-4 text-sm opacity-70">{total} active links with zero clicks. Oldest first.</p>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <label htmlFor="min-age">Older than</label>
        <select id="min-age" value={minAge} onChange={(e) => { setLoading(true); setMinAge(Number(e.target.value)) }} className="rounded border px-2 py-1">
          {AGES.map((d) => <option key={d} value={d}>{d === 0 ? 'any age' : `${d} days`}</option>)}
        </select>
        <button type="button" onClick={() => void archive()} disabled={busy || selected.size === 0} className="rounded border px-3 py-1 disabled:opacity-50">
          Archive {selected.size || ''} selected
        </button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">No links match. Every link has been clicked.</p>
      ) : (
        <ul className="divide-y">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <input type="checkbox" checked={selected.has(l.shortCode)} onChange={() => toggle(l.shortCode)} aria-label={`Select /${l.shortCode}`} />
              <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
              <span className="min-w-0 flex-1 truncate opacity-70">{l.title || l.originalUrl}</span>
              <span className="text-xs opacity-70">{l.ageDays}d old</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
