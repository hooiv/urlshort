'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import type { InsecureLink } from '@/lib/insecure-links'

export default function InsecureLinksPage() {
  const [links, setLinks] = useState<InsecureLink[]>([])
  const [stats, setStats] = useState({ total: 0, insecure: 0, sharePercent: 0 })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/links/insecure?limit=100')
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (cancelled) return
        setLinks(body.links ?? [])
        setStats({ total: body.total ?? 0, insecure: body.insecure ?? 0, sharePercent: body.sharePercent ?? 0 })
        setError(null)
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tick])

  async function upgrade(l: InsecureLink) {
    setBusy(l.shortCode)
    try {
      const r = await fetch(`/api/links/${encodeURIComponent(l.shortCode)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationUrl: l.httpsUrl }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || 'Upgrade failed')
      setTick((t) => t + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><ShieldAlert size={20} /> Insecure destinations</h1>
      <p className="mb-4 text-sm opacity-70">Links pointing at plain http show browser warnings. Upgrade switches the destination to https and records a revision; check the https site works first.</p>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {!loading && <p className="mb-3 text-xs opacity-70">{stats.insecure} of {stats.total} active links use http ({stats.sharePercent}%).</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">Every active link uses https.</p>
      ) : (
        <ul className="divide-y rounded border">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
                <p className="truncate text-xs opacity-70">{l.originalUrl} → {l.httpsUrl}</p>
              </div>
              <span className="text-xs opacity-70">{l.clicks} clicks</span>
              <button type="button" disabled={busy === l.shortCode} onClick={() => upgrade(l)} className="rounded border px-2 py-1 text-xs disabled:opacity-50">
                {busy === l.shortCode ? 'Upgrading…' : 'Upgrade to https'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
