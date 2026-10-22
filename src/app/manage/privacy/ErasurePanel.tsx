'use client'

import { useState } from 'react'

type Result = { matched: number; deleted: number; dryRun: boolean }

/** Data-subject erasure: preview the match count, then confirm deletion. */
export default function ErasurePanel({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const [ip, setIp] = useState('')
  const [visitorId, setVisitorId] = useState('')
  const [preview, setPreview] = useState<Result | null>(null)
  const [done, setDone] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subject = { ...(ip.trim() ? { ip: ip.trim() } : {}), ...(visitorId.trim() ? { visitorId: visitorId.trim() } : {}) }
  const hasSubject = Object.keys(subject).length > 0

  async function run(dryRun: boolean) {
    setBusy(true)
    setError(null)
    if (dryRun) setDone(null)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/privacy/erasure`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...subject, dryRun }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      if (dryRun) setPreview(data)
      else { setDone(data); setPreview(null); setIp(''); setVisitorId('') }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/privacy/access`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subject) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      a.download = 'visitor-data.json'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  function edit(setter: (v: string) => void, v: string) { setter(v); setPreview(null) }

  return (
    <section className="space-y-3 border-t border-slate-800 pt-6" aria-labelledby="erasure-h">
      <h2 id="erasure-h" className="text-xl font-semibold">Erase a visitor&apos;s data</h2>
      <p className="text-sm text-slate-400">
        Delete the raw click events for one person (GDPR/CCPA request). Aggregated counts stay. The action is audited without storing the subject.
      </p>
      <input aria-label="IP address" value={ip} onChange={(e) => edit(setIp, e.target.value)} disabled={!canEdit} placeholder="IP address, e.g. 203.0.113.7" className="w-full font-mono text-sm bg-slate-900 border border-slate-700 rounded px-3 py-2" />
      <input aria-label="Visitor ID" value={visitorId} onChange={(e) => edit(setVisitorId, e.target.value)} disabled={!canEdit} placeholder="Visitor ID (optional)" className="w-full font-mono text-sm bg-slate-900 border border-slate-700 rounded px-3 py-2" />
      <div className="flex gap-3 items-center flex-wrap">
        <button type="button" onClick={() => run(true)} disabled={!canEdit || busy || !hasSubject} className="px-3 py-2 rounded border border-slate-600 text-sm disabled:opacity-50">Preview matches</button>
        <button type="button" onClick={download} disabled={!canEdit || busy || !hasSubject} className="px-3 py-2 rounded border border-slate-600 text-sm disabled:opacity-50">Download their data (JSON)</button>
        {preview && preview.matched > 0 && (
          <button type="button" onClick={() => run(false)} disabled={busy} className="px-3 py-2 rounded bg-red-600 text-sm disabled:opacity-50">
            Permanently delete {preview.matched} event{preview.matched === 1 ? '' : 's'}
          </button>
        )}
        {preview && preview.matched === 0 && <span className="text-sm text-slate-400">No matching events.</span>}
      </div>
      {done && <p role="status" className="text-green-400 text-sm">Deleted {done.deleted} click event{done.deleted === 1 ? '' : 's'}.</p>}
      {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
    </section>
  )
}
