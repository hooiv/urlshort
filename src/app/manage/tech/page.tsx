'use client'

import { useEffect, useState } from 'react'
import { MonitorSmartphone } from 'lucide-react'
import { TECH_WINDOW_OPTIONS, TECH_DIMENSIONS, type TechStat } from '@/lib/tech-performance'

type Workspace = { id: string; name: string; role: string }

export default function TechPerformancePage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [dimension, setDimension] = useState<(typeof TECH_DIMENSIONS)[number]>('browser')
  const [days, setDays] = useState<number>(30)
  const [rows, setRows] = useState<TechStat[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/workspaces')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Workspace[]) => {
        if (!Array.isArray(rows)) return
        setWorkspaces(rows)
        setWorkspaceId((c) => c || rows[0]?.id || '')
        if (rows.length === 0) setLoading(false)
      })
      .catch(() => { setError('Could not load workspaces'); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    fetch(`/api/analytics/tech?workspaceId=${encodeURIComponent(workspaceId)}&dimension=${dimension}&days=${days}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setRows(body.rows ?? []); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId, days, dimension])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold"><MonitorSmartphone size={20} /> Technology performance</h1>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <select aria-label="Workspace" value={workspaceId} onChange={(e) => { setLoading(true); setWorkspaceId(e.target.value) }} className="rounded border px-2 py-1">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select aria-label="Dimension" value={dimension} onChange={(e) => { setLoading(true); setDimension(e.target.value as typeof dimension) }} className="rounded border px-2 py-1">
          {TECH_DIMENSIONS.map((d) => <option key={d} value={d}>{d === 'os' ? 'Operating system' : d === 'device' ? 'Device' : 'Browser'}</option>)}
        </select>
        <label>Last{' '}
          <select value={days} onChange={(e) => { setLoading(true); setDays(Number(e.target.value)) }} className="rounded border px-2 py-1">
            {TECH_WINDOW_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>{' '}vs the {days} days before
        </label>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : rows.length === 0 && !error ? (
        <p className="text-sm opacity-70">No clicks in this window.</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-left opacity-70"><th className="py-1">{dimension === 'os' ? 'OS' : dimension === 'device' ? 'Device' : 'Browser'}</th><th>Visitors</th><th>Clicks</th><th>Share</th><th>Change</th></tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.value ?? 'unknown'} className="border-t">
                <td className="py-2">{f.name}</td>
                <td>{f.visitors.toLocaleString()}</td>
                <td>{f.clicks.toLocaleString()}</td>
                <td>{f.sharePct}%</td>
                <td className={f.changePct === null ? 'opacity-60' : f.changePct >= 0 ? 'text-green-600' : 'text-red-500'}>
                  {f.changePct === null ? 'new' : `${f.changePct > 0 ? '+' : ''}${f.changePct}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
