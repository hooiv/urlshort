'use client'

import { useEffect, useState } from 'react'
import { TimerOff } from 'lucide-react'
import type { ExpiredLink } from '@/lib/expired-links'

export default function ExpiredLinksPage() {
  const [links, setLinks] = useState<ExpiredLink[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/links/expired?limit=100`)
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
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><TimerOff size={20} /> Expired links</h1>
      <p className="mb-4 text-sm opacity-70">{total} active links are past their expiry or click limit. Most recently expired first.</p>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <button type="button" onClick={() => void apply({ extendExpiryDays: 30 })} disabled={busy || selected.size === 0} className="rounded border px-3 py-1 disabled:opacity-50">
          Extend {selected.size || ''} by 30 days
        </button>
        <button type="button" onClick={() => void apply({ archived: true })} disabled={busy || selected.size === 0} className="rounded border px-3 py-1 disabled:opacity-50">
          Archive {selected.size || ''} selected
        </button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">No expired links. Nothing is serving a fallback.</p>
      ) : (
        <ul className="divide-y">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <input type="checkbox" checked={selected.has(l.shortCode)} onChange={() => toggle(l.shortCode)} aria-label={`Select /${l.shortCode}`} />
              <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
              <span className="min-w-0 flex-1 truncate opacity-70">{l.title || l.originalUrl}</span>
              <span className="text-xs opacity-70">{l.reason === 'expired' ? `expired ${l.expiresAt?.slice(0, 10)}` : `${l.clicks}/${l.maxClicks} clicks`}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
