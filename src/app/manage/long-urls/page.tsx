'use client'

import { useEffect, useState } from 'react'
import { Ruler } from 'lucide-react'
import type { LongDestinationLink } from '@/lib/long-destinations'

export default function LongUrlsPage() {
  const [links, setLinks] = useState<LongDestinationLink[]>([])
  const [total, setTotal] = useState(0)
  const [minLength, setMinLength] = useState(1500)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/links/long-urls?limit=100&minLength=${minLength}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (cancelled) return
        setLinks(body.links ?? [])
        setTotal(body.total ?? 0)
        setError(null)
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [minLength])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><Ruler size={20} /> Long destinations</h1>
      <p className="mb-4 text-sm opacity-70">URLs over about 2,000 characters get truncated by SMS gateways, some email clients and older proxies. Shorten tracking parameters on these first.</p>
      <label className="mb-3 flex items-center gap-2 text-xs">
        Minimum length
        <select value={minLength} onChange={(e) => { setLoading(true); setMinLength(Number(e.target.value)) }} className="rounded border bg-transparent px-2 py-1">
          {[500, 1000, 1500, 2000, 4000].map((n) => <option key={n} value={n}>{n} characters</option>)}
        </select>
      </label>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">No active links exceed {minLength} characters.</p>
      ) : (
        <>
          <p className="mb-3 text-xs opacity-70">{total} link{total === 1 ? '' : 's'} at or above {minLength} characters.</p>
          <ul className="divide-y rounded border">
            {links.map((l) => (
              <li key={l.id} className="flex items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
                  <p className="truncate text-xs opacity-70">{l.originalUrl}</p>
                </div>
                <span className={`text-xs ${l.risk === 'high' ? 'text-red-500' : 'opacity-70'}`}>{l.length} chars{l.risk === 'high' ? ' · truncation risk' : ''}</span>
                <span className="text-xs opacity-70">{l.clicks} clicks</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
