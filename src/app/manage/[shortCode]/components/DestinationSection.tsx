'use client'

import { RotateCcw } from 'lucide-react'
import type { Revision } from '@/app/manage/[shortCode]/components/campaign-types'

interface DestinationSectionProps {
  releaseUrl: string
  onReleaseUrlChange: (value: string) => void
  liveRevision: Revision | undefined
  rollbackTarget: Revision | undefined
  rollbackDisabled: boolean
  onPublish: () => void
  onRollback: (revision: Revision) => void
}

export default function DestinationSection({
  releaseUrl,
  onReleaseUrlChange,
  liveRevision,
  rollbackTarget,
  rollbackDisabled,
  onPublish,
  onRollback,
}: DestinationSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-white">Fallback Destination URL</h2>
          <p className="mt-1 text-xs text-slate-400">
            The default destination served when no smart routing rules match. Versioned with append-only revisions.
          </p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
          {liveRevision ? 'Live Release' : 'Default Destination'}
        </span>
      </div>

      <div className="mt-4 flex gap-3">
        <input
          value={releaseUrl}
          onChange={(e) => onReleaseUrlChange(e.target.value)}
          type="url"
          placeholder="https://example.com/campaign"
          className="input flex-1"
        />
        <button
          onClick={onPublish}
          className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-400"
        >
          Publish Release
        </button>
      </div>

      {liveRevision && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs">
          <span className="font-mono text-slate-300 truncate mr-4">{liveRevision.destinationUrl}</span>
          <button
            onClick={() => {
              if (rollbackTarget) onRollback(rollbackTarget)
            }}
            disabled={rollbackDisabled}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500 disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" /> Rollback
          </button>
        </div>
      )}
    </section>
  )
}
