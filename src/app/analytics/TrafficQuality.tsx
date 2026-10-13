'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatNumber } from '@/lib/format'

type Data = {
  totals: { human: number; bot: number; ai_agent: number; total: number; nonHumanPercent: number }
  aiAgents: { agent: string; clicks: number }[]
  suspiciousLinks: { id: string; shortCode: string; title: string | null; total: number; nonHuman: number; nonHumanPercent: number }[]
}

export default function TrafficQuality({ workspaceId }: { workspaceId: string }) {
  const [days, setDays] = useState(7)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const q = new URLSearchParams({ days: String(days) })
    if (workspaceId) q.set('workspaceId', workspaceId)
    fetch(`/api/analytics/traffic-quality?${q}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Could not load traffic quality')
        setError(null)
        setData(body as Data)
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [workspaceId, days])

  const t = data?.totals
  const pct = (n: number) => (t && t.total ? (n / t.total) * 100 : 0)
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5" aria-label="Traffic quality">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Traffic quality</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Traffic quality window" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs">
          {[1, 7, 14, 30, 90].map((d) => <option key={d} value={d}>{d === 1 ? 'Last 24h' : `Last ${d} days`}</option>)}
        </select>
      </div>
      {error ? <p className="text-xs text-rose-400">{error}</p> : !t ? <p className="text-xs text-slate-500">Loading…</p> : t.total === 0 ? <p className="text-xs text-slate-500">No clicks in this period.</p> : (
        <div className="space-y-4 text-xs">
          <div>
            <div className="flex h-2 overflow-hidden rounded-full bg-slate-800" role="img" aria-label={`${t.nonHumanPercent}% non-human traffic`}>
              <div className="bg-emerald-500" style={{ width: `${pct(t.human)}%` }} />
              <div className="bg-amber-500" style={{ width: `${pct(t.ai_agent)}%` }} />
              <div className="bg-red-500" style={{ width: `${pct(t.bot)}%` }} />
            </div>
            <p className="mt-2 text-slate-400">
              <span className="text-emerald-400">{formatNumber(t.human)} human</span> · <span className="text-amber-400">{formatNumber(t.ai_agent)} AI agents</span> · <span className="text-red-400">{formatNumber(t.bot)} bots</span> ({t.nonHumanPercent}% non-human)
            </p>
          </div>
          {data.aiAgents.length > 0 && <p className="text-slate-400">AI agents: {data.aiAgents.map((a) => `${a.agent} (${formatNumber(a.clicks)})`).join(', ')}</p>}
          {data.suspiciousLinks.length > 0 && (
            <ul className="divide-y divide-slate-800">
              {data.suspiciousLinks.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/analytics/${encodeURIComponent(l.shortCode)}`} className="min-w-0 truncate text-blue-300 hover:underline">{l.title || l.shortCode}</Link>
                  <span className="shrink-0 text-red-400">{l.nonHumanPercent}% non-human ({formatNumber(l.nonHuman)} of {formatNumber(l.total)})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
