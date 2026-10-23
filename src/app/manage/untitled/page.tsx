'use client'

import { useEffect, useState } from 'react'
import { Type } from 'lucide-react'

type Workspace = { id: string; name: string; role: string }
type Link = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: string }

export default function UntitledLinksPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [links, setLinks] = useState<Link[]>([])
  const [untitled, setUntitled] = useState(0)
  const [share, setShare] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
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
    fetch(`/api/links/untitled?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setLinks(body.links ?? []); setUntitled(body.untitled ?? 0); setShare(body.sharePercent ?? 0); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId])

  async function save(link: Link) {
    const title = (drafts[link.shortCode] ?? '').trim()
    if (!title) return
    setSaving(link.shortCode)
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(link.shortCode)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not save title')
      setLinks((ls) => ls.filter((l) => l.id !== link.id))
      setUntitled((n) => Math.max(0, n - 1))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><Type size={20} /> Untitled links</h1>
      <p className="mb-4 text-sm opacity-70">{untitled} active links have no title ({share}%). Most-clicked first: name them to make lists and previews readable.</p>
      {workspaces.length > 1 && (
        <select aria-label="Workspace" value={workspaceId} onChange={(e) => { setLoading(true); setWorkspaceId(e.target.value) }} className="mb-3 rounded border px-2 py-1 text-sm">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">Every active link has a title.</p>
      ) : (
        <ul className="divide-y">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
              <span className="hidden min-w-0 flex-1 truncate opacity-70 sm:block">{l.originalUrl}</span>
              <span className="text-xs opacity-70">{l.clicks} clicks</span>
              <input aria-label={`Title for /${l.shortCode}`} maxLength={120} value={drafts[l.shortCode] ?? ''} placeholder="Add a title"
                onChange={(e) => setDrafts((d) => ({ ...d, [l.shortCode]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') void save(l) }}
                className="w-48 rounded border px-2 py-1" />
              <button type="button" disabled={saving === l.shortCode || !(drafts[l.shortCode] ?? '').trim()} onClick={() => void save(l)} className="rounded border px-3 py-1 disabled:opacity-40">Save</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
