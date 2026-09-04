'use client'

import type { Invite } from './types'

export function PendingInvites({
  invites,
  onRevoke,
}: {
  invites: Invite[]
  onRevoke: (inviteId: string) => void
}) {
  if (invites.length === 0) return null
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <h2 className="font-semibold text-white text-sm">Pending Invitations</h2>
      <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
        {invites.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium text-xs text-slate-200">{inv.email}</div>
              <div className="text-[11px] text-slate-500">
                Role: <span className="uppercase font-semibold">{inv.role}</span> · Expires:{' '}
                {new Date(inv.expiresAt).toLocaleDateString()}
              </div>
            </div>

            <button
              onClick={() => void onRevoke(inv.id)}
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/20"
            >
              Revoke
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
