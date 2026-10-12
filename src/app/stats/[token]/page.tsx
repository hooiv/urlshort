import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicStats } from '@/lib/public-stats'
import { resolveWindow } from '@/lib/aggregate-analytics'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Link stats', robots: { index: false, follow: false } }

const RANGES = ['7d', '30d', '90d', '365d'] as const

function Breakdown({ title, rows }: { title: string; rows: Array<{ key: string; clicks: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.clicks))
  return (
    <section style={{ flex: '1 1 260px' }}>
      <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>{title}</h2>
      {rows.length === 0 ? <p style={{ color: '#888', fontSize: 13 }}>No data yet</p> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.map((r) => (
            <li key={r.key} style={{ position: 'relative', padding: '4px 8px', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span aria-hidden style={{ position: 'absolute', inset: 0, width: `${(r.clicks / max) * 100}%`, background: 'rgba(99,102,241,.15)' }} />
              <span style={{ position: 'relative' }}>{r.key}</span>
              <span style={{ position: 'relative' }}>{r.clicks.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default async function PublicStatsPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ range?: string }> }) {
  const { token } = await params
  const { range } = await searchParams
  const chosen = RANGES.includes(range as never) ? (range as string) : '30d'
  const stats = await getPublicStats(token, resolveWindow({ range: chosen }))
  if (!stats) notFound()
  const max = Math.max(1, ...stats.series.map((p) => p.clicks))
  const change = stats.totals.changePercent
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>{stats.link.title || `/${stats.link.shortCode}`}</h1>
      <p style={{ color: '#666', marginTop: 4 }}>/{stats.link.shortCode} · {stats.totals.allTimeClicks.toLocaleString()} clicks all time</p>
      <nav aria-label="Range" style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        {RANGES.map((r) => (
          <a key={r} href={`?range=${r}`} aria-current={r === chosen} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 13, textDecoration: 'none', border: '1px solid #ccc', background: r === chosen ? '#111' : 'transparent', color: r === chosen ? '#fff' : '#111' }}>{r}</a>
        ))}
      </nav>
      <p style={{ fontSize: 32, margin: '0 0 4px' }}>{stats.totals.clicks.toLocaleString()} <small style={{ fontSize: 14, color: '#666' }}>clicks{change !== null ? ` (${change >= 0 ? '+' : ''}${change}% vs previous)` : ''}</small></p>
      <div role="img" aria-label="Clicks per day" style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 120, margin: '16px 0 28px' }}>
        {stats.series.map((p) => (
          <div key={p.date} title={`${p.date}: ${p.clicks}`} style={{ flex: 1, height: `${Math.max(2, (p.clicks / max) * 100)}%`, background: '#6366f1', minWidth: 1 }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Breakdown title="Countries" rows={stats.countries} />
        <Breakdown title="Devices" rows={stats.devices} />
        <Breakdown title="Referrers" rows={stats.referrers} />
      </div>
    </main>
  )
}
