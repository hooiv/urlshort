'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FolderInput } from 'lucide-react'
import type { UnfiledLink } from '@/lib/unfiled-links'

type FolderOption = { id: string; name: string }

function UnfiledLinks() {
  const workspaceId = useSearchParams().get('workspaceId')
  const [links, setLinks] = useState<UnfiledLink[]>([])
  const [total, setTotal] = useState(0)
  const [folders, setFolders] = useState<FolderOption[]>([])
  const [folderId, setFolderId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(workspaceId ? null : 'Open this page with ?workspaceId=… to review a workspace.')
  const [loading, setLoading] = useState(Boolean(workspaceId))
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    const id = encodeURIComponent(workspaceId)
    Promise.all([
      fetch(`/api/links/unfiled?workspaceId=${id}&limit=100`),
      fetch(`/api/workspaces/${id}/folders`),
    ])
      .then(async ([lr, fr]) => {
        const lb = await lr.json()
        if (!lr.ok) throw new Error(lb.error || 'Request failed')
        const fb = fr.ok ? await fr.json() : { folders: [] }
        if (!cancelled) {
          setLinks(lb.links ?? []); setTotal(lb.total ?? 0); setSelected(new Set())
          setFolders(fb.folders ?? []); setError(null)
        }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId, tick])

  function toggle(code: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n })
  }

  async function move() {
    if (selected.size === 0 || !folderId) return
    setBusy(true)
    try {
      const r = await fetch('/api/bulk/edit', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: [...selected], changes: { folderId } }),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Move failed')
      setTick((n) => n + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><FolderInput size={20} /> Links not in any folder</h1>
      <p className="mb-4 text-sm opacity-70">{total} workspace links have no folder. Most clicked first.</p>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <select value={folderId} onChange={(e) => setFolderId(e.target.value)} aria-label="Destination folder" className="rounded border px-2 py-1">
          <option value="">Choose folder…</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button type="button" onClick={() => void move()} disabled={busy || selected.size === 0 || !folderId} className="rounded border px-3 py-1 disabled:opacity-50">
          Move {selected.size || ''} selected
        </button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">Every link is filed in a folder.</p>
      ) : (
        <ul className="divide-y">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <input type="checkbox" checked={selected.has(l.shortCode)} onChange={() => toggle(l.shortCode)} aria-label={`Select /${l.shortCode}`} />
              <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
              <span className="min-w-0 flex-1 truncate opacity-70">{l.title || l.originalUrl}</span>
              <span className="text-xs opacity-70">{l.clicks} clicks</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default function UnfiledLinksPage() {
  return <Suspense fallback={null}><UnfiledLinks /></Suspense>
}
