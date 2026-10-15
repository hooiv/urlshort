'use client'

import { useEffect, useState } from 'react'
import { Link2 } from 'lucide-react'
import type { LinkChain } from '@/lib/link-chains'

const STATUS_LABEL: Record<LinkChain['status'], string> = {
  chain: 'Redirect chain',
  cycle: 'Redirect loop',
  too_long: 'Too many hops',
}

export default function LinkChainsPage() {
  const [chains, setChains] = useState<LinkChain[]>([])
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch('/api/links/chains')
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setChains(body.chains ?? []); setTruncated(Boolean(body.truncated)); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tick])

  async function flatten(c: LinkChain) {
    if (!c.finalUrl) return
    setBusy(c.shortCode)
    try {
      const r = await fetch(`/api/links/${encodeURIComponent(c.shortCode)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationUrl: c.finalUrl }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || 'Flatten failed')
      setTick((t) => t + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><Link2 size={20} /> Redirect chains</h1>
      <p className="mb-4 text-sm opacity-70">Links that point at another short link add a hop to every click. Flatten them to send visitors straight to the final page.</p>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {truncated && <p className="mb-3 text-xs opacity-70">Only the newest 5000 active links were scanned.</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : chains.length === 0 && !error ? (
        <p className="text-sm opacity-70">No links point at other short links.</p>
      ) : (
        <ul className="divide-y rounded border">
          {chains.map((c) => (
            <li key={c.shortCode} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <a href={`/manage/${c.shortCode}`} className="font-mono">/{c.shortCode}</a>
                <span className="font-mono opacity-70">{c.hops.map((h) => ` → /${h}`).join('')}</span>
                <p className="truncate text-xs opacity-70">{c.finalUrl ?? STATUS_LABEL[c.status]}</p>
              </div>
              <span className="rounded border px-2 py-0.5 text-xs">{STATUS_LABEL[c.status]}</span>
              {c.finalUrl && (
                <button type="button" disabled={busy === c.shortCode} onClick={() => void flatten(c)} className="rounded border px-3 py-1 disabled:opacity-50">
                  Flatten
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
