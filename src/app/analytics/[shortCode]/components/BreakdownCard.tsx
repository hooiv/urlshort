'use client'

import type { ReactNode } from 'react'
import { formatNumber } from '@/lib/format'

export interface BreakdownItem {
  id: string
  label: string
  sublabel?: string
  count: number
  percentage: number
  onClick?: () => void
}

export function TechBar({
  label,
  count,
  percentage,
  onClick,
}: {
  label: string
  count: number
  percentage: number
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`group rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 ${
        onClick ? 'cursor-pointer hover:border-blue-500/40' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-1.5 text-xs">
        <span className="font-medium text-slate-200 group-hover:text-blue-300">{label}</span>
        <span className="font-semibold text-slate-100">{formatNumber(count)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, percentage)}%` }} />
      </div>
    </div>
  )
}

export default function BreakdownCard({
  title,
  icon,
  items,
}: {
  title: string
  icon: ReactNode
  items: BreakdownItem[]
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-white">{title}</h3>
        </div>
      </div>
      <div className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <div
              key={item.id}
              onClick={item.onClick}
              className={`group flex items-center justify-between rounded-xl p-2 transition ${
                item.onClick ? 'cursor-pointer hover:bg-slate-950/60' : ''
              }`}
            >
              <div className="min-w-0 pr-2">
                <div className="truncate text-sm font-medium text-slate-200 group-hover:text-blue-300">
                  {item.label}
                </div>
                {item.sublabel && <div className="text-[11px] text-slate-500">{item.sublabel}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-slate-100">{formatNumber(item.count)}</div>
                <div className="text-xs text-slate-500">{item.percentage}%</div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-500">No data available.</p>
        )}
      </div>
    </div>
  )
}
