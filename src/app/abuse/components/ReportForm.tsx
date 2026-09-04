'use client'

import { Send } from 'lucide-react'
import { ABUSE_REASONS, MAX_DETAILS_LENGTH } from './abuse-logic'

const REASON_LABELS: Record<string, string> = {
  phishing: 'Phishing / Credential Theft',
  malware: 'Malware / Executable Download',
  spam: 'Spam / Unsolicited Broadcast',
  copyright: 'DMCA / Copyright Violation',
  other: 'Other Terms Violation',
}

/** Interactive abuse-ticket form (ticket confirmation renders separately). */
export function ReportForm({
  shortCode,
  onShortCodeChange,
  reason,
  onReasonChange,
  details,
  onDetailsChange,
  reporterEmail,
  onReporterEmailChange,
  submitting,
  onSubmit,
}: {
  shortCode: string
  onShortCodeChange: (value: string) => void
  reason: string
  onReasonChange: (value: string) => void
  details: string
  onDetailsChange: (value: string) => void
  reporterEmail: string
  onReporterEmailChange: (value: string) => void
  submitting: boolean
  onSubmit: (event: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="abuse-short-code"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
          >
            Short Link Code / Backhalf
          </label>
          <input
            id="abuse-short-code"
            required
            value={shortCode}
            onChange={(e) => onShortCodeChange(e.target.value)}
            placeholder="e.g. abc1234 or summer-sale"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono"
          />
        </div>

        <div>
          <label
            htmlFor="abuse-reason"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
          >
            Abuse Violation Category
          </label>
          <select
            id="abuse-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 outline-none focus:border-blue-500"
          >
            {ABUSE_REASONS.map((value) => (
              <option key={value} value={value}>
                {REASON_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label
          htmlFor="abuse-reporter"
          className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
        >
          Your Contact Email{' '}
          <span className="font-normal text-slate-500 lowercase">(optional for updates)</span>
        </label>
        <input
          id="abuse-reporter"
          type="email"
          value={reporterEmail}
          onChange={(e) => onReporterEmailChange(e.target.value)}
          placeholder="reporter@security-firm.com"
          autoComplete="email"
          maxLength={254}
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label
          htmlFor="abuse-details"
          className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
        >
          Evidence & Additional Details{' '}
          <span className="font-normal text-slate-500 lowercase">(optional)</span>
        </label>
        <textarea
          id="abuse-details"
          rows={4}
          value={details}
          onChange={(e) => onDetailsChange(e.target.value)}
          placeholder="Provide context, target brand impersonated, or technical headers..."
          maxLength={MAX_DETAILS_LENGTH}
          className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-100 outline-none focus:border-blue-500 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="flex items-center justify-center gap-2 w-full rounded-xl bg-red-500 py-3.5 font-semibold text-xs text-white hover:bg-red-600 disabled:opacity-60 transition shadow-lg shadow-red-500/20"
      >
        <Send className="h-4 w-4" />
        {submitting ? 'Submitting Report…' : 'Submit Abuse Report'}
      </button>
    </form>
  )
}
