import { ShieldCheck } from 'lucide-react'
import type { AuditEvent } from '@/app/account/components/types'
import { formatAuditAction } from '@/app/account/components/account-utils'

export default function ActivitySection({ activity }: { activity: AuditEvent[] }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="mb-5 flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-blue-300" />
        <div>
          <h2 className="font-semibold">Security activity</h2>
          <p className="text-xs text-slate-500">Recent account and campaign changes. IP addresses are never shown.</p>
        </div>
      </div>
      {activity.length ? (
        <div className="divide-y divide-slate-800">
          {activity.slice(0, 25).map((event) => (
            <div key={event.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-200">{formatAuditAction(event.action)}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {event.resourceType || 'account'}
                  {event.urlId ? ` · link ${event.urlId.slice(0, 8)}` : ''}
                </div>
              </div>
              <time className="shrink-0 text-xs text-slate-600">{new Date(event.createdAt).toLocaleString()}</time>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No recorded activity yet.</p>
      )}
    </section>
  )
}
