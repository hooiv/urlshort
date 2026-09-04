import Link from 'next/link'
import type { InviteState } from '@/app/account/components/types'

export default function InviteBanner({
  inviteToken,
  inviteState,
  inviteError,
}: {
  inviteToken: string | null
  inviteState: InviteState
  inviteError: string | null
}) {
  return (
    <>
      {inviteToken && inviteState === 'error' && (
        <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
          <p className="text-sm font-medium text-red-300">Invitation could not be accepted</p>
          <p className="mt-1 text-xs text-red-200/70">
            {inviteError} Make sure you are signed in with the email the invite was sent to.
          </p>
        </section>
      )}
      {inviteState === 'accepted' && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <p className="text-sm font-medium text-emerald-300">Invitation accepted 🎉</p>
          <p className="mt-1 text-xs text-emerald-200/70">
            The workspace now appears in your{' '}
            <Link href="/workspaces" className="underline">
              workspaces
            </Link>
            .
          </p>
        </section>
      )}
    </>
  )
}
