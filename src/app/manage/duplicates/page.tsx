'use client'

import { useEffect, useState } from 'react'
import { CopyMinus } from 'lucide-react'
import { archiveTargets, type DuplicateGroup } from '@/lib/duplicate-links'

export default function DuplicateLinksPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [keep, setKeep] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch('/api/links/duplicates')
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setGroups(body.groups ?? []); setKeep({}); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tick])

  async function archiveOthers(g: DuplicateGroup) {
    const keepId = keep[g.destination] ?? g.keep
    const codes = archiveTargets(g, keepId)
    if (codes.length === 0) return
    setBusy(g.destination)
    try {
      const r = await fetch('/api/bulk/edit', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: codes, changes: { archived: true } }),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Archive failed')
      setTick((t) => t + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold"><CopyMinus size={20} /> Duplicate destinations</h1>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : groups.length === 0 && !error ? (
        <p className="text-sm opacity-70">No two active links point to the same page.</p>
      ) : groups.map((g) => {
        const keepId = keep[g.destination] ?? g.keep
        return (
          <section key={g.destination} className="mb-4 rounded border p-3">
            <p className="truncate text-sm font-medium">{g.destination}</p>
            <p className="mb-2 text-xs opacity-70">{g.count} links, {g.totalClicks} clicks total</p>
            <ul className="divide-y">
              {g.links.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
                  <input type="radio" name={g.destination} checked={keepId === l.id} onChange={() => setKeep((k) => ({ ...k, [g.destination]: l.id }))} aria-label={`Keep /${l.shortCode}`} />
                  <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
                  <span className="ml-auto text-xs opacity-70">{l.clicks} clicks</span>
                </li>
              ))}
            </ul>
            <button type="button" disabled={busy === g.destination} onClick={() => void archiveOthers(g)} className="mt-2 rounded border px-3 py-1 text-sm disabled:opacity-50">
              Keep selected, archive {g.count - 1} other{g.count - 1 > 1 ? 's' : ''}
            </button>
          </section>
        )
      })}
    </main>
  )
}
