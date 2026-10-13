'use client'

import { useCallback, useEffect, useState } from 'react'

type Change = { field: string; before: unknown; after: unknown }
type Item = { id: string; action: string; actorType: string; createdAt: string; changes: Change[] }

const show = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 60 ? `${s.slice(0, 57)}…` : s
}

export default function LinkActivity({ shortCode }: { shortCode: string }) {
  const [items, setItems] = useState<Item[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (after: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ limit: '10' })
      if (after) qs.set('cursor', after)
      const res = await fetch(`/api/links/${encodeURIComponent(shortCode)}/activity?${qs}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not load activity')
      setItems((prev) => (after ? [...prev, ...data.items] : data.items))
      setCursor(data.nextCursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activity')
    } finally {
      setLoading(false)
    }
  }, [shortCode])

  // Initial fetch on mount; load() sets loading state before awaiting the network.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(null) }, [load])

  return (
    <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs" aria-label="Link activity">
      {error && <p role="alert" className="text-red-400">{error}</p>}
      {!error && !loading && items.length === 0 && <p className="text-slate-500">No recorded changes yet.</p>}
      <ol className="space-y-2">
        {items.map((it) => (
          <li key={it.id}>
            <p className="text-slate-300">
              <span className="font-medium">{it.action}</span> by {it.actorType.replace('_', ' ')} · <time dateTime={it.createdAt}>{new Date(it.createdAt).toLocaleString()}</time>
            </p>
            {it.changes.slice(0, 5).map((c) => (
              <p key={c.field} className="pl-3 text-slate-500">{c.field}: {show(c.before)} → {show(c.after)}</p>
            ))}
          </li>
        ))}
      </ol>
      {loading && <p className="text-slate-500">Loading…</p>}
      {cursor && !loading && <button type="button" onClick={() => void load(cursor)} className="mt-2 text-slate-400 hover:text-white">Load older</button>}
    </div>
  )
}
