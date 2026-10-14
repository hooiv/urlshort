'use client'

import { useEffect, useState } from 'react'
import { formatNumber } from '@/lib/format'

type Row = { channel: string; clicks: number; share: number; topHosts: Array<{ host: string; clicks: number }> }
type Result = { days: number; total: number; channels: Row[] }
const LABEL: Record<string, string> = { qr: 'QR code scans', search: 'Search', social: 'Social', email: 'Email', messaging: 'Messaging', other: 'Other sites', direct: 'Direct / unknown' }

export default function TrafficChannels({ shortCode }: { shortCode: string }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/analytics/${encodeURIComponent(shortCode)}/channels?days=${days}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load channels')
        setError(null)
        setData(await res.json())
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [shortCode, days])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6" aria-label="Traffic channels">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-white">Traffic channels</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Channels window" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      {error ? <p className="text-xs text-rose-400">{error}</p> : !data ? <p className="text-xs text-slate-500">Loading…</p> : data.total === 0 ? (
        <p className="text-xs text-slate-500">No human clicks in this window yet.</p>
      ) : (
        <ul className="space-y-3">
          {data.channels.map((c) => (
            <li key={c.channel} className="text-xs">
              <div className="mb-1 flex justify-between text-slate-300"><span>{LABEL[c.channel] ?? c.channel}</span><span>{formatNumber(c.clicks)} · {c.share}%</span></div>
              <div className="h-1.5 rounded bg-slate-800"><div className="h-1.5 rounded bg-sky-400" style={{ width: `${Math.max(2, c.share)}%` }} /></div>
              {c.channel !== 'direct' && c.channel !== 'qr' && c.topHosts.length > 0 && (
                <p className="mt-1 truncate text-slate-500">{c.topHosts.map((h) => `${h.host} (${formatNumber(h.clicks)})`).join(', ')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
