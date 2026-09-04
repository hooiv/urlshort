'use client'

import type { Workspace } from './types'

export function WorkspaceSidebar({
  workspaces,
  selectedId,
  loading,
  error,
  onSelect,
  onRetry,
  form,
}: {
  workspaces: Workspace[]
  selectedId: string | null
  loading: boolean
  error: string | null
  onSelect: (workspace: Workspace) => void
  onRetry: () => void
  form: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
        <span>Your Workspaces</span>
        <span className="font-mono">{workspaces.length}</span>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-500">
          Loading workspaces…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-xs">
          <p className="font-medium text-red-300">Couldn&apos;t load workspaces</p>
          <p className="mt-1 text-slate-500">{error}</p>
          <button onClick={onRetry} className="mt-2 text-blue-400 hover:text-blue-300">
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => void onSelect(workspace)}
              className={`w-full flex flex-col items-start rounded-xl p-3 text-left transition ${
                selectedId === workspace.id
                  ? 'border border-blue-500/40 bg-blue-500/10 text-white shadow-sm'
                  : 'border border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-950 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-semibold text-sm truncate">{workspace.name}</span>
                <span className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-blue-300">
                  {workspace.role}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-500 mt-0.5">{workspace.slug}</span>
            </button>
          ))}
        </div>
      )}

      {form}
    </div>
  )
}
