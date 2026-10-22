'use client'

import { useEffect, useState } from 'react'
import { ShieldOff } from 'lucide-react'
import ErasurePanel from './ErasurePanel'

type Workspace = { id: string; name: string; role: string }
type Policy = {
  region: string; retentionDays: number; hashIp: boolean; hashVisitor: boolean
  storeUserAgent: boolean; storeReferrer: boolean; aggregateOnly: boolean; honorPrivacySignals?: boolean
  analyticsExclusions?: string[] | null
}
const EDIT_ROLES = ['owner', 'admin']
const POLICY_KEYS = ['region', 'retentionDays', 'hashIp', 'hashVisitor', 'storeUserAgent', 'storeReferrer', 'aggregateOnly', 'honorPrivacySignals'] as const

export default function PrivacyExclusionsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [text, setText] = useState('')
  const [myIp, setMyIp] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/workspaces')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Workspace[]) => {
        if (!Array.isArray(rows)) return
        setWorkspaces(rows)
        setWorkspaceId((c) => c || rows[0]?.id || '')
      })
      .catch(() => setError('Could not load workspaces'))
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    const c = new AbortController()
    Promise.all([
      fetch(`/api/workspaces/${workspaceId}/privacy`, { signal: c.signal }),
      fetch(`/api/workspaces/${workspaceId}/privacy/my-ip`, { signal: c.signal }),
    ])
      .then(async ([p, i]) => {
        if (!p.ok) throw new Error('Could not load privacy settings')
        const pol: Policy = await p.json()
        setPolicy(pol)
        setText((pol.analyticsExclusions ?? []).join('\n'))
        setMyIp(i.ok ? (await i.json()).ip : null)
      })
      .catch((e) => e.name !== 'AbortError' && setError(e.message))
    return () => c.abort()
  }, [workspaceId])

  const canEdit = EDIT_ROLES.includes(workspaces.find((w) => w.id === workspaceId)?.role ?? '')
  const entries = text.split(/[\s,]+/).filter(Boolean)

  async function save() {
    if (!policy) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const body = { ...Object.fromEntries(POLICY_KEYS.map((k) => [k, policy[k]])), analyticsExclusions: entries }
      const res = await fetch(`/api/workspaces/${workspaceId}/privacy`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setPolicy(data)
      setText((data.analyticsExclusions ?? []).join('\n'))
      setMessage('Saved. New clicks from these addresses are no longer counted.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldOff className="w-8 h-8 text-blue-500" /> Internal traffic filter
        </h1>
        <p className="text-slate-400 mt-1">
          Clicks from these IPs or CIDR ranges are redirected normally but never counted in analytics.
        </p>
      </div>
      {workspaces.length > 1 && (
        <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-3 py-2">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={policy?.honorPrivacySignals ?? false}
          disabled={!canEdit || !policy}
          onChange={(e) => setPolicy((c) => (c ? { ...c, honorPrivacySignals: e.target.checked } : c))}
          className="mt-1"
        />
        <span>
          Honor Global Privacy Control and Do Not Track. Visitors who send these signals are still counted, but without IP, visitor ID, user agent, referrer or UTM details.
        </span>
      </label>
      <textarea
        aria-label="Excluded IPs and CIDR ranges"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!canEdit || !policy}
        rows={8}
        placeholder={'203.0.113.7\n198.51.100.0/24'}
        className="w-full font-mono text-sm bg-slate-900 border border-slate-700 rounded p-3"
      />
      <div className="flex items-center gap-3 flex-wrap">
        {myIp && canEdit && !entries.includes(myIp) && (
          <button type="button" onClick={() => setText((t) => (t.trim() ? `${t.trim()}\n${myIp}` : myIp))} className="px-3 py-2 rounded border border-slate-600 text-sm">
            Add my IP ({myIp})
          </button>
        )}
        <button type="button" onClick={save} disabled={!canEdit || saving || !policy} className="px-4 py-2 rounded bg-blue-600 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <span className="text-sm text-slate-500">{entries.length}/20 entries</span>
      </div>
      {!canEdit && policy && <p className="text-sm text-slate-400">Only owners and admins can change this list.</p>}
      {message && <p role="status" className="text-green-400 text-sm">{message}</p>}
      {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
      {workspaceId && <ErasurePanel key={workspaceId} workspaceId={workspaceId} canEdit={canEdit} />}
    </div>
  )
}
