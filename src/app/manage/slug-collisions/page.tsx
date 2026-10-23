'use client'

import { useEffect, useState } from 'react'
import { SearchCheck } from 'lucide-react'
import type { SlugCollisionGroup } from '@/lib/slug-collisions'

type Workspace = { id: string; name: string; role: string }

export default function SlugCollisionsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [groups, setGroups] = useState<SlugCollisionGroup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/workspaces')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Workspace[]) => {
        if (!Array.isArray(rows) || rows.length === 0) { setLoading(false); return }
        setWorkspaces(rows)
        setWorkspaceId((c) => c || rows[0].id)
      })
      .catch(() => { setError('Could not load workspaces'); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    const controller = new AbortController()
    fetch(`/api/links/slug-collisions?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal })
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        setGroups(body.groups ?? [])
        setError(null)
      })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [workspaceId])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><SearchCheck size={20} /> Look-alike short codes</h1>
      <p className="mb-4 text-sm opacity-70">Codes that differ only by letter case, - or _ are easy to mistype and can send visitors to the wrong page. Rename or archive one of each pair.</p>
      {workspaces.length > 1 && (
        <select aria-label="Workspace" value={workspaceId} onChange={(e) => { setLoading(true); setWorkspaceId(e.target.value) }} className="mb-4 rounded border px-2 py-1 text-sm">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : groups.length === 0 && !error ? (
        <p className="text-sm opacity-70">No look-alike codes found.</p>
      ) : groups.map((g) => (
        <section key={g.key} className="mb-4 rounded border p-3">
          <p className="mb-2 text-xs opacity-70">{g.sameDestination ? 'Same destination, safe to merge' : 'Different destinations, risk of misdirected traffic'}</p>
          <ul className="divide-y">
            {g.links.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
                <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
                <span className="min-w-0 flex-1 truncate opacity-70">{l.originalUrl}</span>
                <span className="text-xs opacity-70">{l.clicks} clicks</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
