'use client'

import { useEffect, useState } from 'react'
import { QrCode } from 'lucide-react'
import { QR_DAYS_OPTIONS, type QrScanReport } from '@/lib/qr-scans'

type Workspace = { id: string; name: string; role: string }

export default function QrScansPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [days, setDays] = useState<number>(30)
  const [report, setReport] = useState<QrScanReport | null>(null)
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
    fetch(`/api/analytics/qr-scans?workspaceId=${encodeURIComponent(workspaceId)}&days=${days}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setReport(body); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId, days])

  const max = report ? Math.max(1, ...report.daily.map((d) => d.scans)) : 1

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold"><QrCode size={20} /> QR scans</h1>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <select aria-label="Workspace" value={workspaceId} onChange={(e) => { setLoading(true); setWorkspaceId(e.target.value) }} className="rounded border px-2 py-1">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <label>Last{' '}
          <select value={days} onChange={(e) => { setLoading(true); setDays(Number(e.target.value)) }} className="rounded border px-2 py-1">
            {QR_DAYS_OPTIONS.map((d) => <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading || !report ? (loading ? <p className="text-sm opacity-70">Loading…</p> : null) : (
        <>
          <p className="mb-3 text-sm">
            <strong>{report.totals.scans.toLocaleString()}</strong> scans of {report.totals.clicks.toLocaleString()} clicks ({report.totals.scanPercent}%).
            Only QR codes created with tracking on are counted.
          </p>
          <div className="mb-5 flex h-24 items-end gap-px" role="img" aria-label="Daily QR scans">
            {report.daily.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.scans}`} className="flex-1 rounded-t bg-current opacity-60" style={{ height: `${Math.max(2, (d.scans / max) * 100)}%` }} />
            ))}
          </div>
          {report.topLinks.length === 0 ? (
            <p className="text-sm opacity-70">No QR scans in this window.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left opacity-70"><th className="py-1">Link</th><th>Scans</th><th>All clicks</th><th>Scan share</th></tr></thead>
              <tbody>
                {report.topLinks.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-2">{l.title || l.shortCode} <span className="opacity-60">/{l.shortCode}</span></td>
                    <td>{l.scans.toLocaleString()}</td>
                    <td>{l.totalClicks.toLocaleString()}</td>
                    <td>{l.scanPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  )
}
