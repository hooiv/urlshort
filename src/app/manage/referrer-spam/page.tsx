'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { REFERRER_WINDOW_OPTIONS } from '@/lib/referrer-performance'
import type { SpamFlag, SpamSignal } from '@/lib/referrer-spam'

type Workspace = { id: string; name: string; role: string }
type Report = { flagged: SpamFlag[]; spamClicks: number; totalReferredClicks: number; spamSharePct: number }

const SIGNAL_LABEL: Record<SpamSignal, string> = {
  'known-spam': 'Known spam network',
  'single-source': 'Few visitors, many clicks',
  burst: 'Sudden new source',
}

export default function ReferrerSpamPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [days, setDays] = useState<number>(30)
  const [report, setReport] = useState<Report | null>(null)
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
    fetch(`/api/analytics/referrer-spam?workspaceId=${encodeURIComponent(workspaceId)}&days=${days}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Request failed')
        if (!cancelled) { setReport(body); setError(null) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId, days])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold"><ShieldAlert size={20} /> Referrer spam</h1>
      <p className="mb-4 text-sm opacity-70">Hosts that look like fake referrers inflating your referrer report, with the signal that flagged each one.</p>
      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {workspaces.length > 1 && (
          <select aria-label="Workspace" value={workspaceId} onChange={(e) => { setLoading(true); setWorkspaceId(e.target.value) }} className="rounded border bg-transparent px-2 py-1">
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        <select aria-label="Window" value={days} onChange={(e) => { setLoading(true); setDays(Number(e.target.value)) }} className="rounded border bg-transparent px-2 py-1">
          {REFERRER_WINDOW_OPTIONS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
        {workspaceId && <a className="underline" href={`/api/analytics/referrer-spam?workspaceId=${encodeURIComponent(workspaceId)}&days=${days}&format=csv`}>Export CSV</a>}
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {loading ? <p className="text-sm opacity-70">Loading…</p> : report && (
        report.flagged.length === 0 ? <p className="text-sm opacity-70">No suspicious referrers in this window.</p> : (
          <>
            <p className="mb-3 text-sm">{report.spamClicks} of {report.totalReferredClicks} referred clicks ({report.spamSharePct}%) come from flagged hosts.</p>
            <ul className="divide-y rounded border">
              {report.flagged.map((f) => (
                <li key={f.host} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-mono">{f.host}</span>
                  <span className="text-xs opacity-70">{f.signals.map((s) => SIGNAL_LABEL[s]).join(' · ')}</span>
                  <span className="text-xs opacity-70">{f.clicks} clicks · {f.visitors} visitors · {f.sharePct}%</span>
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </main>
  )
}
