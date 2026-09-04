'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import type { User } from '@/app/account/components/types'

export default function VerifyEmailBanner({ user }: { user: User }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  if (user.emailVerifiedAt) return null

  async function resend() {
    setSending(true)
    try {
      const response = await fetch('/api/auth/verify', { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not send verification email')
      setSent(true)
      toast.success('Verification email sent (check the server logs in development)')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send verification email')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-amber-200">Verify your email address</p>
          <p className="mt-1 text-xs text-amber-100/70">
            {sent
              ? 'Link sent — check your inbox. In development it is printed to the server console.'
              : 'Confirm your address to secure account recovery and workspace invitations.'}
          </p>
        </div>
        <button
          onClick={() => void resend()}
          disabled={sending || sent}
          className="shrink-0 rounded-lg bg-amber-400/90 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
        >
          {sending ? 'Sending…' : sent ? 'Sent' : 'Resend link'}
        </button>
      </div>
    </section>
  )
}
