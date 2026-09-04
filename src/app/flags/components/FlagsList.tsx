'use client'

import { formatFlagStatus, type WorkspaceFlag } from '@/app/flags/components/flags-logic'

interface Props {
  flags: WorkspaceFlag[]
  loading: boolean
  error: string | null
}

export default function FlagsList({ flags, loading, error }: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 p-5 font-semibold">Workspace flags</div>
      {loading && <p className="p-4 text-sm text-slate-500">Loading flags…</p>}
      {error && !loading && (
        <p role="alert" className="p-4 text-sm text-red-300">
          {error}
        </p>
      )}
      {!loading && !error && flags.length === 0 && (
        <p className="p-4 text-sm text-slate-500">No flags yet. Create your first flag above.</p>
      )}
      {!loading &&
        !error &&
        flags.map((flag) => (
          <div key={flag.key} className="flex items-center justify-between border-b border-slate-800/60 p-4 last:border-b-0">
            <div>
              <code>{flag.key}</code>
              <div className="text-xs text-slate-500">{formatFlagStatus(flag)}</div>
            </div>
            <span className="text-xs text-slate-500">Changes are recorded in Audit</span>
          </div>
        ))}
    </div>
  )
}
