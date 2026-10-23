'use client'

import { useEffect, useState } from 'react'
import { ServerOff } from 'lucide-react'
import type { InternalDestinationLink } from '@/lib/internal-destinations'

const REASONS: Record<InternalDestinationLink['reason'], string> = {
  loopback: 'localhost',
  'private-ip': 'private network IP',
  'link-local': 'link-local address',
  'internal-suffix': 'internal domain',
  'single-label': 'intranet hostname',
}

export default function InternalUrlsPage() {
  const [links, setLinks] = useState<InternalDestinationLink[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/links/internal-urls?limit=100')
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (cancelled) return
        setLinks(body.links ?? [])
        setTotal(body.total ?? 0)
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><ServerOff size={20} /> Internal destinations</h1>
      <p className="mb-4 text-sm opacity-70">These links point at localhost, private IPs or intranet-only hosts. They work on your network and fail for everyone else.</p>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">No active links point at internal hosts.</p>
      ) : (
        <>
          <p className="mb-3 text-xs opacity-70">{total} link{total === 1 ? '' : 's'} affected.</p>
          <ul className="divide-y rounded border">
            {links.map((l) => (
              <li key={l.id} className="flex items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
                  <p className="truncate text-xs opacity-70">{l.originalUrl}</p>
                </div>
                <span className="text-xs text-red-500">{REASONS[l.reason]}</span>
                <span className="text-xs opacity-70">{l.clicks} clicks</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
