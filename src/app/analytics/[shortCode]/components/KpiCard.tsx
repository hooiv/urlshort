'use client'

import type { ReactNode } from 'react'

export default function KpiCard({
  icon,
  label,
  value,
  subtext,
}: {
  icon: ReactNode
  label: string
  value: string
  subtext: string
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        {icon}
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{subtext}</div>
    </div>
  )
}
