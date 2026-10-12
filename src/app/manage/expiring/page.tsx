'use client'

import { useEffect, useState } from 'react'
import { Hourglass } from 'lucide-react'
import { formatTimeLeft, urgency } from '@/lib/expiring-format'

type Item = {
  id: string; shortCode: string; originalUrl: string; reason: 'time' | 'clicks'
  expiresAt: string | null; msUntilExpiry: number | null; clicks: number
  maxClicks: number | null; remainingClicks: number | null
}
const COLORS = { critical: 'text-red-500', warning: 'text-amber-500', ok: 'text-emerald-500' }

export default function ExpiringLinksPage() {
  const [days, setDays] = useState(7)
  const [links, setLinks] = useState<Item[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/links/expiring?days=${days}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setLinks(body.links); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [days])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Hourglass size={20} /> Expiring links</h1>
        <label className="text-sm">Within{' '}
          <select value={days} onChange={(e) => { setLoading(true); setDays(Number(e.target.value)) }} className="rounded border bg-transparent px-2 py-1">
            {[1, 3, 7, 14, 30, 90].map((d) => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">Nothing is about to expire.</p>
      ) : (
        <ul className="divide-y rounded border">
          {links.map((l) => {
            const u = urgency(l.msUntilExpiry, l.remainingClicks)
            return (
              <li key={l.id} className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <a href={`/manage/${l.shortCode}`} className="font-mono text-sm font-medium">/{l.shortCode}</a>
                  <p className="truncate text-xs opacity-70">{l.originalUrl}</p>
                </div>
                <span className={`whitespace-nowrap text-sm ${COLORS[u]}`}>
                  {l.reason === 'time' ? formatTimeLeft(l.msUntilExpiry) : `${l.remainingClicks} of ${l.maxClicks} clicks left`}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
