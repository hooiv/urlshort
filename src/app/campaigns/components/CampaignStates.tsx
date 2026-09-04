'use client'

import { Target } from 'lucide-react'

export function CampaignLoadingState() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-sm text-slate-500">
      Loading campaign control plane…
    </div>
  )
}

export function CampaignEmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center">
      <Target className="mx-auto h-8 w-8 text-slate-700" />
      <h3 className="mt-4 font-medium text-slate-300">No adaptive campaigns yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
        Create one from the panel, attach it to a permanent short link, and let the campaign become the
        optimization layer behind that URL.
      </p>
    </div>
  )
}

export function CampaignErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-10 text-center">
      <p className="text-sm font-medium text-red-300">Couldn&apos;t load campaigns</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500"
      >
        Try again
      </button>
    </div>
  )
}
