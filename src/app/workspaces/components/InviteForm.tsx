'use client'

import { useState } from 'react'
import { UserPlus } from 'lucide-react'

export function InviteForm({
  busy,
  canInviteAdmin,
  onInvite,
}: {
  busy: boolean
  canInviteAdmin: boolean
  onInvite: (email: string, role: string) => Promise<boolean>
}) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const ok = await onInvite(inviteEmail, inviteRole)
    if (ok) setInviteEmail('')
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex items-center gap-2 font-semibold text-white text-sm mb-1">
        <UserPlus className="h-4 w-4 text-blue-400" />
        <span>Invite Teammates</span>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Send an invitation link with assigned workspace permissions.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
        <input
          required
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="teammate@company.com"
          maxLength={320}
          className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-100 outline-none focus:border-blue-500"
        />

        <select
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-blue-500"
        >
          <option value="viewer">Viewer (Read-only)</option>
          <option value="analyst">Analyst (Stats & Export)</option>
          <option value="editor">Editor (Create & Edit)</option>
          {canInviteAdmin && <option value="admin">Admin (Full Team)</option>}
        </select>

        <button
          disabled={busy}
          className="rounded-xl bg-blue-500 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-60 transition shadow-lg shadow-blue-500/20"
        >
          {busy ? 'Generating…' : 'Create Invite'}
        </button>
      </form>
    </section>
  )
}
