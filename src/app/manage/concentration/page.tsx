'use client'

import { useEffect, useState } from 'react'
import { Layers } from 'lucide-react'
import { CONCENTRATION_PERIOD_OPTIONS, type Concentration } from '@/lib/click-concentration'

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`
const LEVEL_TEXT: Record<Concentration['level'], string> = {
  none: 'No human clicks in this period.',
  diversified: 'Traffic is spread across many links.',
  moderate: 'A few links carry a large part of your traffic.',
  concentrated: 'One link carries most of your traffic.',
}

export default function ClickConcentrationPage() {
  const [days, setDays] = useState<number>(30)
  const [data, setData] = useState<Concentration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/analytics/concentration?days=${days}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setData(body); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [days])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold"><Layers size={20} /> Click concentration</h1>
      <label className="mb-3 block text-sm">Last{' '}
        <select value={days} onChange={(e) => { setLoading(true); setDays(Number(e.target.value)) }} className="rounded border px-2 py-1">
          {CONCENTRATION_PERIOD_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
        </select>
      </label>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : data && (
        <>
          <p className="mb-3 text-sm">{LEVEL_TEXT[data.level]}{data.totalClicks > 0 && ` ${data.linksFor80Percent} of ${data.linkCount} links make up 80% of ${data.totalClicks} clicks.`}</p>
          {data.totalClicks > 0 && (
            <>
              <ul className="mb-4 flex gap-4 text-sm">
                {data.topShares.map((t) => <li key={t.top}>Top {t.top}: <strong>{pct(t.share)}</strong></li>)}
                <li>Gini: <strong>{data.gini}</strong></li>
              </ul>
              <ul className="divide-y">
                {data.top.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
                    <a href={`/manage/${l.shortCode}`} className="font-mono">/{l.shortCode}</a>
                    <span className="min-w-0 flex-1 truncate opacity-70">{l.title ?? ''}</span>
                    <span className="text-xs">{l.clicks} clicks · {pct(l.share)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  )
}
