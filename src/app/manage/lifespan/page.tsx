'use client'

import { useEffect, useState } from 'react'
import { Hourglass } from 'lucide-react'
import type { LinkLifespan } from '@/lib/click-lifespan'

export default function LinkLifespanPage() {
  const [links, setLinks] = useState<LinkLifespan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/analytics/lifespan')
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setLinks(body.links ?? []); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold"><Hourglass size={20} /> Burst vs evergreen</h1>
      <p className="mb-4 text-sm opacity-70">Share of each link&apos;s clicks that arrived in its first 48 hours of traffic. Links need 50+ human clicks and a week of history.</p>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">No link has enough history yet.</p>
      ) : (
        <ul className="divide-y">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
              <span className="min-w-0 flex-1 truncate opacity-70">{l.originalUrl}</span>
              <span className="text-xs">{Math.round(l.earlyShare * 100)}% early · {l.totalClicks} total · {l.lastWeekClicks} last 7d</span>
              <span className="rounded border px-2 py-0.5 text-xs uppercase">{l.pattern}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
