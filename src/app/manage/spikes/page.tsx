'use client'

import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'
import { SPIKE_WINDOW_HOURS_OPTIONS, type ClickSpike } from '@/lib/click-spikes'

export default function ClickSpikesPage() {
  const [windowHours, setWindowHours] = useState<number>(24)
  const [spikes, setSpikes] = useState<ClickSpike[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/analytics/spikes?windowHours=${windowHours}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setSpikes(body.spikes ?? []); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [windowHours])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold"><Flame size={20} /> Click spikes</h1>
      <label className="mb-3 block text-sm">Compare the last{' '}
        <select value={windowHours} onChange={(e) => { setLoading(true); setWindowHours(Number(e.target.value)) }} className="rounded border px-2 py-1">
          {SPIKE_WINDOW_HOURS_OPTIONS.map((h) => <option key={h} value={h}>{h} hours</option>)}
        </select>{' '}to each link&apos;s previous 14 days
      </label>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : spikes.length === 0 && !error ? (
        <p className="text-sm opacity-70">No link is running well above its usual traffic.</p>
      ) : (
        <ul className="divide-y">
          {spikes.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <a href={`/manage/${s.shortCode}`} className="font-mono">/{s.shortCode}</a>
              <span className="min-w-0 flex-1 truncate opacity-70">{s.originalUrl}</span>
              <span className="text-xs">{s.recentClicks} clicks · usually {s.baselinePerWindow}</span>
              <span className="rounded border px-2 py-0.5 text-xs uppercase">{s.severity}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
