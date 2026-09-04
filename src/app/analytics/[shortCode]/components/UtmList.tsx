'use client'

import { formatNumber } from '@/lib/format'
import type { UtmStat } from './types'

export default function UtmList({ title, items }: { title: string; items: UtmStat[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h3 className="font-semibold text-white mb-4">{title}</h3>
      <div className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={item.name} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="font-mono text-xs font-semibold text-blue-400 truncate">{item.name}</div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400">Clicks: </span>
                  <span className="font-semibold text-slate-200">{formatNumber(item.clicks)}</span>
                </div>
                <div>
                  <span className="text-slate-400">CVR: </span>
                  <span className="font-semibold text-emerald-400">{(item.conversionRate * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-500">No parameters captured.</p>
        )}
      </div>
    </div>
  )
}
