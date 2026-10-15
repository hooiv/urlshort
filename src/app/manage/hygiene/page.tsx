'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { LinkHygiene } from '@/lib/link-hygiene'

type Item = { key: keyof LinkHygiene; label: string; href?: string; bad: boolean; issue?: string }
type AttentionLink = { id: string; shortCode: string; originalUrl: string; clicks: number }

const ITEMS: Item[] = [
  { key: 'destinationDown', issue: 'down', label: 'Destination down', bad: true },
  { key: 'destinationDegraded', issue: 'degraded', label: 'Destination degraded', bad: true },
  { key: 'expired', issue: 'expired', label: 'Expired', bad: true },
  { key: 'expiringSoon', label: 'Expiring in 7 days', href: '/manage/expiring', bad: true },
  { key: 'clickLimitReached', issue: 'clickLimitReached', label: 'Click limit reached', bad: true },
  { key: 'flaggedRisky', issue: 'flaggedRisky', label: 'Flagged by safety checks', bad: true },
  { key: 'untagged', issue: 'untagged', label: 'Untagged', bad: false },
  { key: 'scheduled', issue: 'scheduled', label: 'Scheduled to go live', bad: false },
  { key: 'passwordProtected', label: 'Password protected', bad: false },
  { key: 'archived', label: 'Archived', href: '/manage/trash', bad: false },
]

export default function HygienePage() {
  const [data, setData] = useState<LinkHygiene | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [links, setLinks] = useState<AttentionLink[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  async function toggle(issue: string) {
    if (open === issue) { setOpen(null); return }
    setOpen(issue); setLinks(null); setListError(null)
    try {
      const r = await fetch(`/api/links/attention?issue=${encodeURIComponent(issue)}&limit=25`)
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Request failed')
      setLinks(body.links)
    } catch (e) { setListError((e as Error).message) }
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/links/hygiene')
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) setData(body)
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Link hygiene</h1>
      <p className="mt-1 text-sm text-gray-500">What needs attention across your {data ? data.total : ''} links.</p>
      {error && <p role="alert" className="mt-4 text-red-600">{error}</p>}
      {!data && !error && <p className="mt-4 text-gray-500">Loading…</p>}
      {data && (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {ITEMS.map((i) => {
            const v = data[i.key]
            const body = (
              <div className={`rounded-lg border p-4 ${i.bad && v > 0 ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                <div className="text-3xl font-semibold">{v.toLocaleString()}</div>
                <div className="text-sm text-gray-600">{i.label}</div>
              </div>
            )
            if (i.issue && v > 0) {
              return (
                <li key={i.key}>
                  <button type="button" className="w-full text-left" aria-expanded={open === i.issue} onClick={() => toggle(i.issue!)}>{body}</button>
                </li>
              )
            }
            return <li key={i.key}>{i.href ? <Link href={i.href}>{body}</Link> : body}</li>
          })}
        </ul>
      )}
      {open && (
        <section className="mt-6" aria-live="polite">
          <h2 className="text-lg font-medium">{ITEMS.find((i) => i.issue === open)?.label}</h2>
          {listError && <p role="alert" className="text-red-600">{listError}</p>}
          {!links && !listError && <p className="text-gray-500">Loading…</p>}
          {links && links.length === 0 && <p className="text-gray-500">Nothing to show.</p>}
          {links && links.length > 0 && (
            <ul className="mt-2 divide-y rounded-lg border">
              {links.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/manage/${l.shortCode}`} className="font-medium">/{l.shortCode}</Link>
                    <div className="truncate text-gray-500">{l.originalUrl}</div>
                  </div>
                  <span className="shrink-0 text-gray-600">{l.clicks.toLocaleString()} clicks</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}
