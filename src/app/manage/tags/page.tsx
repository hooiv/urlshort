'use client'

import { useEffect, useState } from 'react'
import { Tags } from 'lucide-react'
import { TAG_WINDOW_OPTIONS, type TagStat } from '@/lib/tag-performance'

export default function TagPerformancePage() {
  const [days, setDays] = useState<number>(30)
  const [tags, setTags] = useState<TagStat[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/analytics/tags?days=${days}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setTags(body.tags ?? []); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [days])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold"><Tags size={20} /> Tag performance</h1>
      <label className="mb-3 block text-sm">Last{' '}
        <select value={days} onChange={(e) => { setLoading(true); setDays(Number(e.target.value)) }} className="rounded border px-2 py-1">
          {TAG_WINDOW_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
        </select>{' '}vs the {days} days before
      </label>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : tags.length === 0 && !error ? (
        <p className="text-sm opacity-70">No tagged links yet. Add tags to links to compare campaigns here.</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-left opacity-70"><th className="py-1">Tag</th><th>Links</th><th>Clicks</th><th>Share</th><th>Change</th></tr></thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.tag} className="border-t">
                <td className="py-2 font-mono">{t.tag}</td>
                <td>{t.links}</td>
                <td>{t.clicks.toLocaleString()}</td>
                <td>{t.sharePct}%</td>
                <td className={t.changePct === null ? 'opacity-60' : t.changePct >= 0 ? 'text-green-600' : 'text-red-500'}>
                  {t.changePct === null ? 'new' : `${t.changePct > 0 ? '+' : ''}${t.changePct}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
