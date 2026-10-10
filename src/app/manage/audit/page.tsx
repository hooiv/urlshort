'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollText, Download } from 'lucide-react'

type Workspace = { id: string; name: string; role: string }
type AuditItem = { id: string; time: string; action: string; actorType?: string; actorUserId?: string | null; resourceType?: string | null; resourceId?: string | null }
const ADMIN = ['owner', 'admin']

export default function AuditLogPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [items, setItems] = useState<AuditItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [action, setAction] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/workspaces')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Workspace[]) => {
        if (!Array.isArray(rows)) return
        const admin = rows.filter((w) => ADMIN.includes(w.role))
        setWorkspaces(admin)
        setWorkspaceId((c) => c || admin[0]?.id || '')
      })
      .catch(() => setError('Could not load workspaces'))
  }, [])

  const query = useCallback((extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(extra)
    if (action.trim()) q.set('action', action.trim())
    if (search.trim()) q.set('search', search.trim())
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    return q.toString()
  }, [action, search, from, to])

  const load = useCallback(async (cursor?: string) => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/audit?${query(cursor ? { cursor } : {})}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not load audit log')
      setItems((prev) => (cursor ? [...prev, ...body.items] : body.items))
      setNextCursor(body.nextCursor ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load audit log')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, query])

  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><ScrollText className="w-8 h-8 text-blue-500" />Audit log</h1>
        <p className="text-slate-400 mt-1">Who changed what in this workspace. Owners and admins only; CSV export covers up to 10,000 rows of the selected range.</p>
      </header>
      {workspaces.length === 0 && !error && <p className="text-sm text-slate-400">You need to be an owner or admin of a workspace to view its audit log.</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {workspaces.length > 0 && (
        <form onSubmit={(e) => { e.preventDefault(); void load() }} className="grid gap-3 sm:grid-cols-6 items-end">
          <select aria-label="Workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm">
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <input aria-label="Action filter" placeholder="Action, e.g. link.update" value={action} onChange={(e) => setAction(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
          <input aria-label="Search" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
          <input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
          <input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button disabled={loading} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-3 py-2 text-sm font-medium">Filter</button>
            <a href={`/api/workspaces/${workspaceId}/audit?${query({ format: 'csv' })}`} className="inline-flex items-center gap-1 border border-slate-700 rounded-lg px-3 py-2 text-sm hover:bg-slate-800"><Download className="w-4 h-4" />CSV</a>
          </div>
        </form>
      )}
      {items.length > 0 && (
        <div className="overflow-x-auto bg-slate-900/60 border border-slate-800 rounded-xl">
          <table className="w-full text-sm text-left">
            <thead className="text-slate-400"><tr><th className="p-3">Time (UTC)</th><th className="p-3">Action</th><th className="p-3">Actor</th><th className="p-3">Resource</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-slate-800">
                  <td className="p-3 whitespace-nowrap">{i.time.replace('T', ' ').slice(0, 19)}</td>
                  <td className="p-3 font-mono">{i.action}</td>
                  <td className="p-3">{i.actorUserId ?? i.actorType ?? 'system'}</td>
                  <td className="p-3 break-all">{[i.resourceType, i.resourceId].filter(Boolean).join(' ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && workspaceId && items.length === 0 && !error && <p className="text-sm text-slate-400">No events match.</p>}
      {nextCursor && <button disabled={loading} onClick={() => void load(nextCursor)} className="border border-slate-700 rounded-lg px-4 py-2 text-sm hover:bg-slate-800">Load more</button>}
    </div>
  )
}
