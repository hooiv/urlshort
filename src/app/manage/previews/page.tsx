'use client'

import { useEffect, useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import type { MissingPreviewLink } from '@/lib/missing-previews'

const FIELD_LABEL = { title: 'Title', description: 'Description', image: 'Image' } as const

export default function MissingPreviewsPage() {
  const [links, setLinks] = useState<MissingPreviewLink[]>([])
  const [counts, setCounts] = useState({ total: 0, incomplete: 0 })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/links/missing-previews?limit=100')
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (cancelled) return
        setLinks(body.links ?? [])
        setCounts({ total: body.total ?? 0, incomplete: body.incomplete ?? 0 })
        setError(null)
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><ImageIcon size={20} /> Social previews</h1>
      <p className="mb-4 text-sm opacity-70">Links missing a title, description or image look bare when shared. Most-clicked first; open one to edit its preview.</p>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {!loading && !error && <p className="mb-3 text-xs opacity-70">{counts.incomplete} of {counts.total} active links are incomplete.</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">Every active link has a complete preview.</p>
      ) : (
        <ul className="divide-y rounded border">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
                <p className="truncate text-xs opacity-70">{l.originalUrl}</p>
              </div>
              <span className="text-xs opacity-70">{l.clicks} clicks</span>
              <span className="flex gap-1">
                {l.missing.map((f) => <span key={f} className="rounded border px-2 py-0.5 text-xs">No {FIELD_LABEL[f].toLowerCase()}</span>)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
