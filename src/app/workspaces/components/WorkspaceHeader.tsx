'use client'

import { LogOut, Users } from 'lucide-react'
import type { Workspace } from './types'
import { memberCountLabel, shouldShowLeave } from './workspaceLogic'

export function WorkspaceHeader({
  workspace,
  memberCount,
  onLeave,
}: {
  workspace: Workspace
  memberCount: number
  onLeave: () => void
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white">{workspace.name}</h1>
            <span className="rounded-full bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 font-mono text-xs text-blue-300">
              /{workspace.slug}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Your permissions: <span className="font-semibold text-white uppercase">{workspace.role}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-300">
            <Users className="h-3.5 w-3.5 text-blue-400" />
            <span>{memberCountLabel(memberCount)}</span>
          </div>
          {shouldShowLeave(workspace.role) && (
            <button
              onClick={() => void onLeave()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20"
            >
              <LogOut className="h-3 w-3" /> Leave
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
