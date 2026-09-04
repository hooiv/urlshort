import { CheckCircle2 } from 'lucide-react'

/** Presentational ticket confirmation (no interactivity beyond reset). */
export function TicketConfirmation({
  ticketId,
  onReset,
}: {
  ticketId: string | null
  onReset: () => void
}) {
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-3">
      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
      <h3 className="font-bold text-white text-base">Abuse Report Received</h3>
      <p className="text-xs text-emerald-200/80 max-w-md mx-auto">
        Thank you for notifying us. Reference Ticket ID:{' '}
        <code className="font-mono text-emerald-300 font-bold">{ticketId ?? 'pending'}</code>.
        High-risk phishing links are suspended automatically within seconds.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-2 inline-flex rounded-xl bg-slate-900 border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500"
      >
        Submit Another Report
      </button>
    </div>
  )
}
