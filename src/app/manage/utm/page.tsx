'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Tags, Trash2 } from 'lucide-react'
import { previewUtmTemplate, UTM_KEYS, type UtmKey } from '@/lib/utm-templates'

type Workspace = { id: string; name: string; role: string }
type Template = { id: string; name: string } & Record<UtmKey, string | null>
const EDIT_ROLES = ['owner', 'admin', 'editor']
const EMPTY: Record<UtmKey, string> = { source: '', medium: '', campaign: '', term: '', content: '' }

export default function UtmTemplatesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [name, setName] = useState('')
  const [values, setValues] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/workspaces')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Workspace[]) => {
        if (!Array.isArray(rows)) return
        setWorkspaces(rows)
        setWorkspaceId((current) => current || rows[0]?.id || '')
      })
      .catch(() => setError('Could not load workspaces'))
  }, [])

  const load = useCallback(async (id: string, signal?: AbortSignal) => {
    const res = await fetch(`/api/workspaces/${id}/utm-templates`, { signal })
    if (!res.ok) throw new Error('Could not load templates')
    setTemplates((await res.json()).templates ?? [])
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    const controller = new AbortController()
    fetch(`/api/workspaces/${workspaceId}/utm-templates`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Could not load templates'))))
      .then((data) => setTemplates(data.templates ?? []))
      .catch((e) => e.name !== 'AbortError' && setError(e.message))
    return () => controller.abort()
  }, [workspaceId])

  const canEdit = EDIT_ROLES.includes(workspaces.find((w) => w.id === workspaceId)?.role ?? '')
  const preview = useMemo(() => previewUtmTemplate('https://example.com/pricing', values), [values])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/utm-templates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, ...Object.fromEntries(UTM_KEYS.map((k) => [k, values[k] || null])) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save template')
      setName('')
      setValues(EMPTY)
      await load(workspaceId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(t: Template) {
    const before = templates
    setTemplates(before.filter((x) => x.id !== t.id))
    const res = await fetch(`/api/workspaces/${workspaceId}/utm-templates/${t.id}`, { method: 'DELETE' })
    if (!res.ok) {
      setTemplates(before)
      setError('Could not delete template')
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Tags className="w-8 h-8 text-blue-500" />UTM templates</h1>
        <p className="text-slate-400 mt-1">Save campaign tags once, then apply them when creating links with utmTemplateId. Tags already on a destination are never overwritten.</p>
      </div>

      {workspaces.length > 1 && (
        <select aria-label="Workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {canEdit && (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <label className="sm:col-span-2 text-sm text-slate-300">Template name
            <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" />
          </label>
          {UTM_KEYS.map((k) => (
            <label key={k} className="text-sm text-slate-300">utm_{k}
              <input maxLength={120} value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" />
            </label>
          ))}
          <p className="sm:col-span-2 text-xs text-slate-400 break-all" aria-live="polite">
            {'url' in preview ? <>Preview: {preview.url}</> : preview.error}
          </p>
          <button disabled={saving || !name.trim() || 'error' in preview} className="sm:col-span-2 justify-self-start bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium">
            {saving ? 'Saving…' : 'Save template'}
          </button>
        </form>
      )}

      <ul className="space-y-2">
        {templates.length === 0 && <li className="text-sm text-slate-500">No templates yet.</li>}
        {templates.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-slate-400 truncate">{UTM_KEYS.filter((k) => t[k]).map((k) => `${k}=${t[k]}`).join(' · ')}</p>
            </div>
            {canEdit && <button aria-label={`Delete ${t.name}`} onClick={() => remove(t)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
          </li>
        ))}
      </ul>
    </div>
  )
}
