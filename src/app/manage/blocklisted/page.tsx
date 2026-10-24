'use client'

import { useEffect, useState } from 'react'
import { ShieldOff } from 'lucide-react'

type Workspace = { id: string; name: string }
type BlocklistedLink = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; cidrs: number; referrerHosts: number }

export default function BlocklistedLinksPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [links, setLinks] = useState<BlocklistedLink[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/workspaces')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Workspace[]) => {
        if (!Array.isArray(rows)) return
        setWorkspaces(rows)
        setWorkspaceId((c) => c || rows[0]?.id || '')
      })
      .catch(() => setError('Could not load workspaces'))
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    const controller = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag precedes the fetch for the selected workspace
    setLoading(true)
    fetch(`/api/links/blocklisted?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`, { signal: controller.signal })
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        setLinks(body.links ?? []); setTotal(body.total ?? 0); setError(null)
      })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [workspaceId])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><ShieldOff size={20} /> Blocklisted links</h1>
      <p className="mb-4 text-sm opacity-70">{total} links have a visitor blocklist. Most clicked first.</p>
      {workspaces.length > 1 && (
        <select aria-label="Workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="mb-3 rounded border px-2 py-1 text-sm">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">No links use cloaking.</p>
      ) : (
        <ul className="divide-y">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
              <span className="min-w-0 flex-1 truncate opacity-70">{l.title || l.originalUrl}</span>
              <span className="text-xs opacity-70">
                {l.cidrs} IP rules, {l.referrerHosts} referrers, {l.clicks} clicks
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
