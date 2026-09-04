'use client'

import { ShieldCheck, X } from 'lucide-react'
import { ROLE_PERMISSIONS } from './types'

export function RoleMatrix({ onClose }: { onClose: () => void }) {
  return (
    <section className="mb-8 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 animate-in fade-in duration-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-300">
          <ShieldCheck className="h-4 w-4" /> Role Permissions Matrix
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(ROLE_PERMISSIONS).map(([role, desc]) => (
          <div key={role} className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
            <div className="font-mono text-xs font-bold uppercase tracking-wide text-white mb-1">{role}</div>
            <div className="text-xs text-slate-400 leading-relaxed">{desc}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
