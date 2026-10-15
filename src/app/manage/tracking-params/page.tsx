'use client'

import { useEffect, useState } from 'react'
import { Eraser } from 'lucide-react'
import type { DirtyLink } from '@/lib/tracking-params'

export default function TrackingParamsPage() {
  const [links, setLinks] = useState<DirtyLink[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/links/tracking-params?limit=100')
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (cancelled) return
        setLinks(body.links ?? [])
        setError(null)
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tick])

  async function clean(l: DirtyLink) {
    setBusy(l.shortCode)
    try {
      const r = await fetch(`/api/links/${encodeURIComponent(l.shortCode)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationUrl: l.cleanUrl }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || 'Clean failed')
      setTick((t) => t + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><Eraser size={20} /> Tracking parameters</h1>
      <p className="mb-4 text-sm opacity-70">Destinations containing click ids such as fbclid or gclid leak one visitor&apos;s id to everyone and break caching. Cleaning removes them and records a revision.</p>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">No destinations carry click ids.</p>
      ) : (
        <ul className="divide-y rounded border">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
                <p className="truncate text-xs opacity-70">Removes {l.removed.join(', ')} → {l.cleanUrl}</p>
              </div>
              <span className="text-xs opacity-70">{l.clicks} clicks</span>
              <button type="button" disabled={busy === l.shortCode} onClick={() => clean(l)} className="rounded border px-2 py-1 text-xs disabled:opacity-50">
                {busy === l.shortCode ? 'Cleaning…' : 'Clean URL'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
