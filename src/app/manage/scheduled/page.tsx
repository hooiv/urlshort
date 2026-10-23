'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Rocket } from 'lucide-react'
import type { ScheduledLink } from '@/lib/scheduled-links'

function ScheduledLinks() {
  const workspaceId = useSearchParams().get('workspaceId')
  const [links, setLinks] = useState<ScheduledLink[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(workspaceId ? null : 'Open this page with ?workspaceId=… to review a workspace.')
  const [loading, setLoading] = useState(Boolean(workspaceId))
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    const id = encodeURIComponent(workspaceId)
    fetch(`/api/links/scheduled?workspaceId=${id}&limit=100`)
      .then(async (lr) => {
        const lb = await lr.json()
        if (!lr.ok) throw new Error(lb.error || 'Request failed')
        if (!cancelled) { setLinks(lb.links ?? []); setTotal(lb.total ?? 0); setSelected(new Set()); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId, tick])

  function toggle(code: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n })
  }

  async function launch() {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const r = await fetch('/api/bulk/edit', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: [...selected], changes: { startsAt: null } }),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Launch failed')
      setTick((n) => n + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><Rocket size={20} /> Scheduled links</h1>
      <p className="mb-4 text-sm opacity-70">{total} workspace links go live in the future. Soonest first.</p>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <button type="button" onClick={() => void launch()} disabled={busy || selected.size === 0} className="rounded border px-3 py-1 disabled:opacity-50">
          Launch {selected.size || ''} now
        </button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">No links are waiting to go live.</p>
      ) : (
        <ul className="divide-y">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <input type="checkbox" checked={selected.has(l.shortCode)} onChange={() => toggle(l.shortCode)} aria-label={`Select /${l.shortCode}`} />
              <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
              <span className="min-w-0 flex-1 truncate opacity-70">{l.title || l.originalUrl}</span>
              <time dateTime={String(l.startsAt)} className="text-xs opacity-70">{new Date(l.startsAt).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default function ScheduledLinksPage() {
  return <Suspense fallback={null}><ScheduledLinks /></Suspense>
}
