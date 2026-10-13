'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'

type Item = { id: string; shortCode: string; originalUrl: string; clicks: number; deletedAt: string; daysLeft: number }

export default function TrashPage() {
  const [links, setLinks] = useState<Item[]>([])
  const [retention, setRetention] = useState(30)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/links/trash')
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Request failed')
      setLinks(body.links)
      setRetention(body.retentionDays)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
  useEffect(() => { void load() }, [load])

  async function act(l: Item, kind: 'restore' | 'purge') {
    if (kind === 'purge' && !window.confirm(`Erase /${l.shortCode} and its ${l.clicks} clicks of history forever?`)) return
    setBusy(l.shortCode)
    try {
      const r = kind === 'restore'
        ? await fetch(`/api/links/${l.shortCode}/restore`, { method: 'POST' })
        : await fetch(`/api/links/${l.shortCode}?permanent=true`, { method: 'DELETE' })
      if (!r.ok && r.status !== 404) throw new Error((await r.json().catch(() => ({}))).error || 'Action failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><Trash2 size={20} /> Trash</h1>
      <p className="mb-4 text-sm opacity-70">Deleted links stay recoverable for {retention} days, then are erased with their analytics.</p>
      {error && <p role="alert" className="mb-2 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">Trash is empty.</p>
      ) : (
        <ul className="divide-y rounded border">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-4 p-3">
              <div className="min-w-0">
                <span className="font-mono text-sm font-medium">/{l.shortCode}</span>
                <p className="truncate text-xs opacity-70">{l.originalUrl}</p>
                <p className="text-xs opacity-60">{l.clicks} clicks · erased in {l.daysLeft} day{l.daysLeft === 1 ? '' : 's'}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button disabled={busy === l.shortCode} onClick={() => void act(l, 'restore')} className="rounded border px-3 py-1 text-sm">Restore</button>
                <button disabled={busy === l.shortCode} onClick={() => void act(l, 'purge')} className="rounded border border-red-500/40 px-3 py-1 text-sm text-red-500">Erase</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
