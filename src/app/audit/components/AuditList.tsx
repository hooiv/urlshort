'use client'

import { formatAuditDate, formatAuditSubtitle, type AuditEvent } from './audit-logic'

/** Interactive audit list with loading / error / empty states and retry. */
export function AuditList({
  loading,
  error,
  events,
  onRetry,
}: {
  loading: boolean
  error: string | null
  events: AuditEvent[]
  onRetry: () => void
}) {
  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Loading audit history…</div>
  }
  if (error) {
    return (
      <div className="space-y-3 p-8 text-sm">
        <p role="alert" className="text-red-300">
          {error}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
        >
          Retry
        </button>
      </div>
    )
  }
  if (events.length === 0) {
    return <div className="p-8 text-sm text-slate-500">No matching audit events.</div>
  }
  return (
    <div className="divide-y divide-slate-800">
      {events.map((event) => (
        <div key={event.id} className="grid gap-2 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="font-medium">{event.action}</div>
            <div className="mt-1 text-xs text-slate-500">{formatAuditSubtitle(event)}</div>
          </div>
          <time className="text-xs text-slate-600">{formatAuditDate(event.createdAt)}</time>
        </div>
      ))}
    </div>
  )
}
