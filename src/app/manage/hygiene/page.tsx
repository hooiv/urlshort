'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { LinkHygiene } from '@/lib/link-hygiene'

const ITEMS: { key: keyof LinkHygiene; label: string; href?: string; bad: boolean }[] = [
  { key: 'destinationDown', label: 'Destination down', bad: true },
  { key: 'destinationDegraded', label: 'Destination degraded', bad: true },
  { key: 'expired', label: 'Expired', bad: true },
  { key: 'expiringSoon', label: 'Expiring in 7 days', href: '/manage/expiring', bad: true },
  { key: 'clickLimitReached', label: 'Click limit reached', bad: true },
  { key: 'flaggedRisky', label: 'Flagged by safety checks', bad: true },
  { key: 'untagged', label: 'Untagged', bad: false },
  { key: 'scheduled', label: 'Scheduled to go live', bad: false },
  { key: 'passwordProtected', label: 'Password protected', bad: false },
  { key: 'archived', label: 'Archived', href: '/manage/trash', bad: false },
]

export default function HygienePage() {
  const [data, setData] = useState<LinkHygiene | null>(null)
  const [error, setError] = useState<string | null>(null)

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
            return <li key={i.key}>{i.href ? <Link href={i.href}>{body}</Link> : body}</li>
          })}
        </ul>
      )}
    </main>
  )
}
