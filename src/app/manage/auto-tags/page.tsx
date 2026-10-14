'use client'

import { useEffect, useMemo, useState } from 'react'
import { Wand2, Trash2, Plus } from 'lucide-react'
import { applyAutoTagRules, MAX_AUTO_TAG_RULES, type AutoTagRule } from '@/lib/auto-tag-rules'

type Workspace = { id: string; name: string; role: string }
type Draft = { host: string; pathContains: string; tags: string }
const ADMIN = ['owner', 'admin']

function toRule(d: Draft): AutoTagRule {
  const rule: AutoTagRule = { tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean) }
  if (d.host.trim()) rule.host = d.host.trim()
  if (d.pathContains.trim()) rule.pathContains = d.pathContains.trim()
  return rule
}

export default function AutoTagRulesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [rules, setRules] = useState<AutoTagRule[]>([])
  const [draft, setDraft] = useState<Draft>({ host: '', pathContains: '', tags: '' })
  const [sample, setSample] = useState('https://example.com/blog/launch')
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
    const controller = new AbortController()
    fetch(`/api/workspaces/${workspaceId}/auto-tag-rules`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load rules'))))
      .then((d) => setRules(d.rules ?? []))
      .catch((e) => e.name !== 'AbortError' && setError(e.message))
    return () => controller.abort()
  }, [workspaceId])

  const canEdit = ADMIN.includes(workspaces.find((w) => w.id === workspaceId)?.role ?? '')
  const preview = useMemo(() => applyAutoTagRules(rules, sample).added, [rules, sample])

  async function persist(next: AutoTagRule[]) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/auto-tag-rules`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rules: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save rules')
      setRules(data.rules)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (await persist([...rules, toRule(draft)])) setDraft({ host: '', pathContains: '', tags: '' })
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Wand2 className="w-8 h-8 text-blue-500" />Auto-tag rules</h1>
        <p className="text-slate-400 mt-1">Tag new links automatically by destination host or path. Rules only add tags and apply when a link is created.</p>
      </div>
      {workspaces.length > 1 && (
        <select aria-label="Workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {canEdit && rules.length < MAX_AUTO_TAG_RULES && (
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-3 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <label className="text-sm text-slate-300">Host (example.com or *.example.com)
            <input maxLength={253} value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm text-slate-300">Path contains
            <input maxLength={200} value={draft.pathContains} onChange={(e) => setDraft({ ...draft, pathContains: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm text-slate-300">Tags (comma separated)
            <input required value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" />
          </label>
          <button disabled={saving || !draft.tags.trim() || (!draft.host.trim() && !draft.pathContains.trim())} className="sm:col-span-3 justify-self-start inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium">
            <Plus className="w-4 h-4" />{saving ? 'Saving…' : 'Add rule'}
          </button>
        </form>
      )}

      <ul className="space-y-2">
        {rules.length === 0 && <li className="text-sm text-slate-500">No rules yet.</li>}
        {rules.map((r, i) => (
          <li key={`${r.host ?? ''}|${r.pathContains ?? ''}|${i}`} className="flex items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{[r.host && `host ${r.host}`, r.pathContains && `path contains “${r.pathContains}”`].filter(Boolean).join(' · ')}</p>
              <p className="text-xs text-slate-400">adds {r.tags.join(', ')}</p>
            </div>
            {canEdit && <button aria-label={`Delete rule ${i + 1}`} disabled={saving} onClick={() => persist(rules.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
          </li>
        ))}
      </ul>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-2">
        <label className="text-sm text-slate-300 block">Try a destination
          <input value={sample} onChange={(e) => setSample(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" />
        </label>
        <p className="text-sm text-slate-400" aria-live="polite">{preview.length ? `Would add: ${preview.join(', ')}` : 'No rule matches this destination.'}</p>
      </div>
    </div>
  )
}
