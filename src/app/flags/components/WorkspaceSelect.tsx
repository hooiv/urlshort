'use client'

import type { WorkspaceOption } from '@/app/flags/components/flags-logic'

interface Props {
  workspaces: WorkspaceOption[]
  selected: string
  loading: boolean
  error: string | null
  onChange: (value: string) => void
}

export default function WorkspaceSelect({ workspaces, selected, loading, error, onChange }: Props) {
  return (
    <div>
      <label className="block text-sm">
        Workspace
        <select
          aria-label="Workspace"
          value={selected}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading}
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 disabled:opacity-50"
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name} · {workspace.role}
            </option>
          ))}
        </select>
      </label>
      {loading && <p className="mt-2 text-xs text-slate-500">Loading workspaces…</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      {!loading && !error && workspaces.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">No workspaces found for this account.</p>
      )}
    </div>
  )
}
