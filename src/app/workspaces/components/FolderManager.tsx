'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { BarChart3, Folder, Lock, Trash2, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Member } from './types'

type GrantRole = 'editor' | 'analyst' | 'viewer'
interface FolderRow {
  id: string
  name: string
  description: string | null
  restricted: boolean
  linkCount: number
  role: string | null
  access?: Array<{ userId: string; role: GrantRole; email: string; name: string | null }>
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error((data as { error?: string }).error || 'Request failed'), { status: response.status, data })
  return data as T
}

/** Create, restrict, share and delete a workspace's link folders. */
export function FolderManager({ workspaceId, members, canEdit }: { workspaceId: string; members: Member[]; canEdit: boolean }) {
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [canAdminister, setCanAdminister] = useState(false)
  const [name, setName] = useState('')
  const [restricted, setRestricted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/folders`

  const load = useCallback(async () => {
    try {
      const data = await api<{ folders: FolderRow[]; canAdminister: boolean }>(base)
      setFolders(data.folders)
      setCanAdminister(data.canAdminister)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }, [base])

  useEffect(() => {
    // Initial fetch on mount; load() only sets state after awaiting the network.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      await api(base, { method: 'POST', body: JSON.stringify({ name, restricted }) })
      setName('')
      setRestricted(false)
      toast.success('Folder created')
      await load()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function update(folder: FolderRow, patch: Record<string, unknown>) {
    try {
      await api(`${base}/${folder.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      await load()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function remove(folder: FolderRow) {
    if (!window.confirm(`Delete "${folder.name}"? Its ${folder.linkCount} link(s) stay in the workspace, outside any folder.`)) return
    try {
      await api(`${base}/${folder.id}`, { method: 'DELETE' })
    } catch (error) {
      const failure = error as Error & { data?: { code?: string } }
      if (failure.data?.code !== 'would_expose_links') return void toast.error(failure.message)
      if (!window.confirm(`${failure.message}\n\nDelete anyway?`)) return
      try {
        await api(`${base}/${folder.id}?exposeLinks=true`, { method: 'DELETE' })
      } catch (retry) {
        return void toast.error((retry as Error).message)
      }
    }
    toast.success('Folder deleted')
    await load()
  }

  function toggleGrant(folder: FolderRow, member: Member, role: GrantRole | '') {
    const current = (folder.access ?? []).filter((a) => a.userId !== member.id).map(({ userId, role }) => ({ userId, role }))
    void update(folder, { access: role ? [...current, { userId: member.id, role }] : current })
  }

  const grantable = members.filter((m) => m.role !== 'owner' && m.role !== 'admin')

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Folder className="h-4 w-4 text-blue-400" />
        <h2 className="font-semibold text-white">Link folders</h2>
        <span className="text-xs text-slate-500">Restricted folders are visible only to owners, admins and the people you add.</span>
      </div>

      {canEdit && (
        <form onSubmit={create} className="flex flex-wrap items-center gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="New folder, e.g. Q4 launch" className="flex-1 min-w-[200px] rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
          {canAdminister && (
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} /> Restricted
            </label>
          )}
          <button disabled={busy || !name.trim()} className="rounded-xl bg-blue-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">Create</button>
        </form>
      )}

      {folders.length === 0 ? (
        <p className="text-sm text-slate-500">No folders yet.</p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {folders.map((folder) => (
            <li key={folder.id} className="py-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {folder.restricted ? <Lock className="h-4 w-4 text-amber-400" /> : <Folder className="h-4 w-4 text-slate-500" />}
                <span className="font-medium text-white">{folder.name}</span>
                <span className="text-xs text-slate-500">{folder.linkCount} link{folder.linkCount === 1 ? '' : 's'}</span>
                {folder.role && folder.role !== 'owner' && folder.role !== 'admin' && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">{folder.role}</span>}
                <div className="ml-auto flex items-center gap-2">
                  <Link href={`/analytics?workspaceId=${encodeURIComponent(workspaceId)}&folder=${encodeURIComponent(folder.id)}`} className="rounded-lg p-1.5 text-slate-400 hover:text-white" title="Folder analytics">
                    <BarChart3 className="h-4 w-4" />
                  </Link>
                  {canAdminister && (
                    <>
                      <button onClick={() => void update(folder, { restricted: !folder.restricted })} className="rounded-lg border border-slate-800 px-2 py-1 text-xs text-slate-400 hover:text-white">
                        {folder.restricted ? 'Open to workspace' : 'Restrict'}
                      </button>
                      {folder.restricted && (
                        <button onClick={() => setEditing(editing === folder.id ? null : folder.id)} className="rounded-lg p-1.5 text-slate-400 hover:text-white" title="Who has access">
                          <Users className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => void remove(folder)} className="rounded-lg p-1.5 text-slate-500 hover:text-red-400" title="Delete folder">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editing === folder.id && folder.restricted && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                  <p className="text-xs text-slate-500">Owners and admins always have access. A grant never exceeds someone&apos;s workspace role.</p>
                  {grantable.length === 0 && <p className="text-xs text-slate-500">No other members to add.</p>}
                  {grantable.map((member) => {
                    const grant = folder.access?.find((a) => a.userId === member.id)?.role ?? ''
                    return (
                      <div key={member.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-slate-300">{member.name || member.email}</span>
                        <select value={grant} onChange={(e) => toggleGrant(folder, member, e.target.value as GrantRole | '')} className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs">
                          <option value="">No access</option>
                          <option value="viewer">Viewer</option>
                          <option value="analyst">Analyst</option>
                          <option value="editor">Editor</option>
                        </select>
                      </div>
                    )
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
