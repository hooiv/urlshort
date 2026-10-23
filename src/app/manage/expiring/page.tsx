'use client'

import { useEffect, useState } from 'react'
import { Hourglass } from 'lucide-react'
import { formatTimeLeft, urgency } from '@/lib/expiring-format'

type Item = {
  id: string; shortCode: string; originalUrl: string; reason: 'time' | 'clicks'
  expiresAt: string | null; msUntilExpiry: number | null; clicks: number
  maxClicks: number | null; remainingClicks: number | null
  runway?: { clicksPerDay: number; daysRemaining: number | null } | null
}
const COLORS = { critical: 'text-red-500', warning: 'text-amber-500', ok: 'text-emerald-500' }

export default function ExpiringLinksPage() {
  const [days, setDays] = useState(7)
  const [links, setLinks] = useState<Item[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  async function extend(l: Item) {
    setBusy(l.shortCode)
    setError(null)
    const body = l.reason === 'time' ? { days: 30 } : { addClicks: Math.max(100, l.maxClicks ?? 100) }
    try {
      const r = await fetch(`/api/links/${encodeURIComponent(l.shortCode)}/extend`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Extend failed')
      setReload((n) => n + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

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
  }, [days, reload])

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
                  {l.reason === 'time' ? formatTimeLeft(l.msUntilExpiry) : `${l.remainingClicks} of ${l.maxClicks} clicks left${l.runway?.daysRemaining != null ? ` · runs out in ~${l.runway.daysRemaining}d at ${l.runway.clicksPerDay}/day` : ''}`}
                </span>
                <button type="button" disabled={busy === l.shortCode} onClick={() => extend(l)} className="whitespace-nowrap rounded border px-2 py-1 text-xs disabled:opacity-50">
                  {busy === l.shortCode ? 'Extending…' : l.reason === 'time' ? 'Extend 30 days' : 'Add clicks'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
