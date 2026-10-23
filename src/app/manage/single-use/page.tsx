'use client'

import { useEffect, useState } from 'react'
import { Ticket } from 'lucide-react'

type Workspace = { id: string; name: string; role: string }
type Link = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; status: 'pending' | 'consumed'; createdAt: string }
const FILTERS = ['all', 'pending', 'consumed'] as const

export default function SingleUseLinksPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('pending')
  const [links, setLinks] = useState<Link[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/workspaces')
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((rows: Workspace[]) => { setWorkspaces(rows); setWorkspaceId((c) => c || rows[0]?.id || ''); if (rows.length === 0) setLoading(false) })
      .catch(() => { setError('Could not load workspaces'); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    fetch(`/api/links/single-use?workspaceId=${encodeURIComponent(workspaceId)}&status=${status}&limit=100`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setLinks(body.links ?? []); setTotal(body.total ?? 0); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId, status])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><Ticket size={20} /> One-time links</h1>
      <p className="mb-4 text-sm opacity-70">{total} links that stop working after a single click. Pending links have not been opened yet.</p>
      <div className="mb-3 flex items-center gap-2 text-sm">
        {workspaces.length > 1 && (
          <select aria-label="Workspace" value={workspaceId} onChange={(e) => { setLoading(true); setWorkspaceId(e.target.value) }} className="rounded border px-2 py-1">
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={status === f} onClick={() => { setLoading(true); setStatus(f) }}
            className={`rounded border px-3 py-1 capitalize ${status === f ? 'font-semibold' : 'opacity-70'}`}>{f}</button>
        ))}
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">No one-time links here. Set a click limit of 1 on a link to create one.</p>
      ) : (
        <ul className="divide-y">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
              <span className="min-w-0 flex-1 truncate opacity-70">{l.title || l.originalUrl}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${l.status === 'pending' ? 'bg-green-500/15' : 'bg-zinc-500/15'}`}>{l.status === 'pending' ? 'Pending' : 'Used'}</span>
              <time className="text-xs opacity-70" dateTime={l.createdAt}>{l.createdAt.slice(0, 10)}</time>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
