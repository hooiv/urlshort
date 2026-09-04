'use client'

import { ShieldCheck } from 'lucide-react'

interface Props {
  password: string
  confirm: string
  busy: boolean
  done: boolean
  token: string
  onPasswordChange: (value: string) => void
  onConfirmChange: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
}

export default function ResetPasswordCard({
  password,
  confirm,
  busy,
  done,
  token,
  onPasswordChange,
  onConfirmChange,
  onSubmit,
}: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-blue-300" />
        <h1 className="text-xl font-semibold">Choose a new password</h1>
      </div>
      {done ? (
        <p className="mt-6 text-sm leading-6 text-slate-400">
          Your password has been reset and all sessions were signed out. Redirecting you to sign in…
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <label className="block text-sm">
            <span className="mb-2 block text-xs text-slate-400">New password (12+ characters)</span>
            <input
              required
              type="password"
              minLength={12}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-2 block text-xs text-slate-400">Confirm new password</span>
            <input
              required
              type="password"
              minLength={12}
              value={confirm}
              onChange={(e) => onConfirmChange(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </label>
          <button
            disabled={busy || !token}
            className="w-full rounded-xl bg-blue-500 px-4 py-3 font-semibold hover:bg-blue-400 disabled:opacity-60"
          >
            {busy ? 'Resetting…' : 'Reset password'}
          </button>
          {!token && (
            <p className="text-xs text-red-400">
              This link is missing its reset token. Request a new one from the sign-in page.
            </p>
          )}
        </form>
      )}
    </div>
  )
}
