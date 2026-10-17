'use client'

import { useCallback, useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import type { UtmHygieneLink } from '@/lib/utm-hygiene'

const REASON_LABEL: Record<string, string> = {
  uppercase: 'mixed case',
  whitespace: 'stray whitespace',
  'duplicate-key': 'repeated key',
}

export default function UtmHygienePage() {
  const [links, setLinks] = useState<UtmHygieneLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [failed, setFailed] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/links/utm-hygiene?limit=200')
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Request failed')
      setLinks(body.links ?? [])
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function apply(l: UtmHygieneLink) {
    setBusy((s) => new Set(s).add(l.shortCode))
    try {
      const r = await fetch(`/api/links/${encodeURIComponent(l.shortCode)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationUrl: l.fixedUrl }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || 'Fix failed')
      setFailed((f) => { const n = { ...f }; delete n[l.shortCode]; return n })
      setLinks((ls) => ls.filter((x) => x.shortCode !== l.shortCode))
    } catch (e) {
      setFailed((f) => ({ ...f, [l.shortCode]: (e as Error).message }))
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(l.shortCode); return n })
    }
  }

  async function applyAll() {
    for (const l of links) await apply(l)
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><Wrench size={20} /> UTM hygiene</h1>
      <p className="mb-4 text-sm opacity-70">
        &ldquo;Newsletter&rdquo; and &ldquo;newsletter&rdquo; show up as two campaigns in reports. Fixing a link records a destination revision.
      </p>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : links.length === 0 && !error ? (
        <p className="text-sm opacity-70">No UTM casing, whitespace or duplicate-key problems found.</p>
      ) : (
        <>
          <button type="button" disabled={busy.size > 0 || links.length === 0} onClick={() => void applyAll()} className="mb-3 rounded border px-3 py-1 text-sm disabled:opacity-50">
            Fix all {links.length}
          </button>
          <ul className="divide-y">
            {links.map((l) => (
              <li key={l.id} className="py-3 text-sm">
                <div className="flex items-center gap-3">
                  <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
                  <span className="text-xs opacity-70">{l.clicks} clicks</span>
                  <button type="button" disabled={busy.has(l.shortCode)} onClick={() => void apply(l)} className="ml-auto rounded border px-3 py-1 disabled:opacity-50">
                    {busy.has(l.shortCode) ? 'Fixing…' : 'Apply fix'}
                  </button>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {l.issues.map((i, n) => (
                    <li key={n}><code>{i.key}</code> {REASON_LABEL[i.reason] ?? i.reason}: <code>{JSON.stringify(i.value)}</code> → <code>{JSON.stringify(i.suggested)}</code></li>
                  ))}
                </ul>
                <p className="mt-1 truncate text-xs opacity-60">{l.fixedUrl}</p>
                {failed[l.shortCode] && <p role="alert" className="mt-1 text-xs text-red-500">{failed[l.shortCode]}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
