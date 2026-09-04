'use client'

import { Trash2 } from 'lucide-react'
import type { Member } from './types'
import { ROLES } from './types'
import { getInitials } from './workspaceLogic'

export function MemberList({
  members,
  isAdmin,
  loading,
  error,
  onRoleChange,
  onRemove,
  onRetry,
}: {
  members: Member[]
  isAdmin: boolean
  loading: boolean
  error: string | null
  onRoleChange: (member: Member, role: string) => void
  onRemove: (member: Member) => void
  onRetry: () => void
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">Team Members</h2>
          <p className="text-xs text-slate-400">Individuals with collaborative access to this workspace</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-500">
          Loading team members…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-xs">
          <p className="font-medium text-red-300">Couldn&apos;t load team members</p>
          <p className="mt-1 text-slate-500">{error}</p>
          <button onClick={onRetry} className="mt-2 text-blue-400 hover:text-blue-300">
            Try again
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
          {members.map((member) => {
            const initials = getInitials(member.name, member.email)

            return (
              <div key={member.id} className="flex items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-400 shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-slate-200 truncate">
                      {member.name || member.email}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{member.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && member.role !== 'owner' ? (
                    <select
                      value={member.role}
                      onChange={(e) => void onRoleChange(member, e.target.value)}
                      className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 outline-none focus:border-blue-500"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-md bg-slate-900 border border-slate-800 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-slate-400">
                      {member.role}
                    </span>
                  )}

                  {isAdmin && member.role !== 'owner' && (
                    <button
                      onClick={() => void onRemove(member)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                      title="Remove member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
