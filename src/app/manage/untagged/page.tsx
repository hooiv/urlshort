'use client'

import { useEffect, useState } from 'react'
import { Tags } from 'lucide-react'
import type { UntaggedLink } from '@/lib/untagged-links'

export default function UntaggedLinksPage() {
  const [links, setLinks] = useState<UntaggedLink[]>([])
  const [stats, setStats] = useState<{ total: number; untagged: number; sharePercent: number } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tag, setTag] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/links/untagged?limit=100')
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) {
          setLinks(body.links ?? [])
          setStats({ total: body.total, untagged: body.untagged, sharePercent: body.sharePercent })
          setSelected(new Set())
          setError(null)
        }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tick])

  function toggle(code: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n })
  }

  async function applyTag() {
    const t = tag.trim().toLowerCase()
    if (!t || selected.size === 0) return
    setBusy(true)
    try {
      const r = await fetch('/api/bulk/edit', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: [...selected], changes: { addTags: [t] } }),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Tagging failed')
      setTag('')
      setTick((n) => n + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><Tags size={20} /> Untagged links</h1>
      {stats && <p className="mb-4 text-sm opacity-70">{stats.untagged} of {stats.total} active links have no tags ({stats.sharePercent}%). Most-clicked first.</p>}
      <form className="mb-3 flex items-center gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); void applyTag() }}>
        <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={40} placeholder="Tag to add" aria-label="Tag to add" className="rounded border px-2 py-1" />
        <button type="submit" disabled={busy || !tag.trim() || selected.size === 0} className="rounded border px-3 py-1 disabled:opacity-50">
          Tag {selected.size || ''} selected
        </button>
      </form>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">Every active link has at least one tag.</p>
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
