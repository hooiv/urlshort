'use client'

import { useEffect, useState } from 'react'
import { Archive, Unlink } from 'lucide-react'
import type { BrokenLink } from '@/lib/broken-links'

export default function BrokenLinksPage() {
  const [status, setStatus] = useState<'all' | 'down' | 'degraded'>('all')
  const [links, setLinks] = useState<BrokenLink[]>([])
  const [truncated, setTruncated] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/analytics/broken?status=${status}&limit=200`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setLinks(body.links ?? []); setTruncated(Boolean(body.truncated)); setSelected(new Set()); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status, tick])

  function toggle(code: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n })
  }

  async function archive() {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const r = await fetch('/api/bulk/edit', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: [...selected], changes: { archived: true } }),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Archive failed')
      setTick((t) => t + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold"><Unlink size={20} /> Broken links</h1>
      <div className="mb-3 flex items-center gap-3 text-sm">
        <label>Show{' '}
          <select value={status} onChange={(e) => { setLoading(true); setStatus(e.target.value as typeof status) }} className="rounded border px-2 py-1">
            <option value="all">down and degraded</option>
            <option value="down">down only</option>
            <option value="degraded">degraded only</option>
          </select>
        </label>
        <button type="button" disabled={busy || selected.size === 0} onClick={() => void archive()} className="ml-auto flex items-center gap-1 rounded border px-3 py-1 disabled:opacity-50">
          <Archive size={14} /> Archive {selected.size || ''} selected
        </button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">No active link has a failing destination.</p>
      ) : (
        <ul className="divide-y">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <input type="checkbox" checked={selected.has(l.shortCode)} onChange={() => toggle(l.shortCode)} aria-label={`Select /${l.shortCode}`} />
              <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
              <span className="min-w-0 flex-1 truncate opacity-70" title={l.lastError ?? undefined}>{l.originalUrl}</span>
              <span className={`text-xs ${l.status === 'down' ? 'text-red-500' : 'text-amber-500'}`}>
                {l.status}{l.statusCode ? ` ${l.statusCode}` : ''} · {l.consecutiveFailures} fails · {l.clicksLast7d} clicks/7d
              </span>
            </li>
          ))}
        </ul>
      )}
      {truncated && <p className="mt-3 text-xs opacity-70">Showing the 200 worst links. Fix or archive some and reload for more.</p>}
    </main>
  )
}
