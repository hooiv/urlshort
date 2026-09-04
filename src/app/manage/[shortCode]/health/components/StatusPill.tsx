'use client'

import { Activity, CheckCircle2, TriangleAlert, XCircle } from 'lucide-react'
import type { Status } from './types'

export function StatusIcon({ status }: { status: Status }) {
  if (status === 'healthy') return <CheckCircle2 className="h-8 w-8 text-emerald-400" />
  if (status === 'down') return <XCircle className="h-8 w-8 text-red-400" />
  if (status === 'degraded') return <TriangleAlert className="h-8 w-8 text-amber-400" />
  return <Activity className="h-8 w-8 text-slate-500" />
}

export function StatusPill({ status }: { status: Status }) {
  const styles = {
    healthy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    down: 'bg-red-500/10 text-red-400 border-red-500/30',
    degraded: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    unknown: 'bg-slate-800 text-slate-400 border-slate-700',
  }
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
        styles[status]
      }`}
    >
      {status}
    </span>
  )
}
