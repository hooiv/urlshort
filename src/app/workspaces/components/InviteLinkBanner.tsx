'use client'

import { CheckCircle2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { PendingInviteToken } from './types'

export function InviteLinkBanner({
  pending,
  inviteLink,
  onDismiss,
}: {
  pending: PendingInviteToken
  inviteLink: (token: string) => string
  onDismiss: () => void
}) {
  const url = inviteLink(pending.token)
  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 animate-in fade-in duration-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> 1-Click Invitation Link Ready
          </div>
          <p className="mt-1 text-xs text-emerald-200/80">
            Share this private link with <span className="font-semibold">{pending.email}</span>.
          </p>
        </div>
        <button onClick={onDismiss} className="text-slate-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-emerald-300">
          {url}
        </code>
        <button
          onClick={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(url)
                toast.success('Invitation link copied!')
              } catch {
                toast.error('Clipboard copy failed')
              }
            })()
          }}
          className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-400 transition"
        >
          Copy Link
        </button>
      </div>
    </section>
  )
}
