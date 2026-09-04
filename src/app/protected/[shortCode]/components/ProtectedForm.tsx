'use client'

import { ArrowRight, Lock, ShieldCheck } from 'lucide-react'

interface Props {
  shortCode: string
  password: string
  error: string
  loading: boolean
  onPasswordChange: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
}

export default function ProtectedForm({
  shortCode,
  password,
  error,
  loading,
  onPasswordChange,
  onSubmit,
}: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl backdrop-blur-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-center text-2xl font-bold text-white">Protected Link</h1>
        <p className="mt-2 text-center text-xs text-slate-400">
          Access to <span className="font-mono text-blue-300 font-semibold">/{shortCode}</span> is restricted by the creator. Enter the access password to continue.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Enter link password…"
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-xs text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-mono"
              autoFocus
            />
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 font-semibold text-xs text-white transition hover:bg-blue-400 disabled:opacity-50 shadow-lg shadow-blue-500/20"
          >
            {loading ? 'Verifying Credentials…' : 'Unlock Destination'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          Password-protected access
        </div>
      </div>
    </div>
  )
}
