'use client'

import { Laptop, LogOut } from 'lucide-react'
import type { Session } from '@/app/account/security/components/session-utils'
import { labelSessionDevice } from '@/app/account/security/components/session-utils'

export default function SessionsSection({
  sessions,
  loading,
  revoking,
  onRevoke,
}: {
  sessions: Session[]
  loading: boolean
  revoking: string | null
  onRevoke: (sessionId?: string) => void
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-semibold">Active sessions</h2>
        <button
          onClick={() => onRevoke()}
          disabled={revoking !== null}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-60"
        >
          Sign out everywhere else
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Loading sessions…</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950 p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Laptop className="h-5 w-5 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {labelSessionDevice(session.userAgent)}
                    {session.current && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Last seen {new Date(session.lastSeenAt).toLocaleString()} · Created{' '}
                    {new Date(session.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              {!session.current && (
                <button
                  onClick={() => onRevoke(session.id)}
                  disabled={revoking !== null}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:border-red-400 hover:text-red-300 disabled:opacity-60"
                >
                  <LogOut className="h-3.5 w-3.5" /> Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
