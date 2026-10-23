'use client'

import { useEffect, useState } from 'react'
import { Gauge } from 'lucide-react'
import type { NearCapLink } from '@/lib/near-cap-links'

export default function NearCapLinksPage() {
  const [links, setLinks] = useState<NearCapLink[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const [newCap, setNewCap] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/links/near-cap?limit=100`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setLinks(body.links ?? []); setTotal(body.total ?? 0); setSelected(new Set()); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tick])

  function toggle(code: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n })
  }

  async function apply(changes: Record<string, unknown>) {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const r = await fetch('/api/bulk/edit', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: [...selected], changes }),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Update failed')
      setTick((n) => n + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><Gauge size={20} /> Links nearing their click limit</h1>
      <p className="mb-4 text-sm opacity-70">{total} active links have used 80% or more of their click limit. Closest to the cap first.</p>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <input type="number" min={1} max={1000000000} value={newCap} onChange={(e) => setNewCap(e.target.value)} placeholder="New limit" aria-label="New click limit" className="w-32 rounded border px-2 py-1" />
        <button type="button" onClick={() => void apply({ maxClicks: Number(newCap) })} disabled={busy || selected.size === 0 || !/^\d{1,10}$/.test(newCap) || Number(newCap) < 1} className="rounded border px-3 py-1 disabled:opacity-50">
          Set limit for {selected.size || ''}
        </button>
        <button type="button" onClick={() => void apply({ maxClicks: null })} disabled={busy || selected.size === 0} className="rounded border px-3 py-1 disabled:opacity-50">
          Remove limit
        </button>
        <button type="button" onClick={() => void apply({ archived: true })} disabled={busy || selected.size === 0} className="rounded border px-3 py-1 disabled:opacity-50">
          Archive {selected.size || ''} selected
        </button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">No links are close to their click limit.</p>
      ) : (
        <ul className="divide-y">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <input type="checkbox" checked={selected.has(l.shortCode)} onChange={() => toggle(l.shortCode)} aria-label={`Select /${l.shortCode}`} />
              <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
              <span className="min-w-0 flex-1 truncate opacity-70">{l.title || l.originalUrl}</span>
              <span className="text-xs opacity-70">{l.clicks}/{l.maxClicks} clicks ({l.percentUsed}%), {l.remaining} left</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
