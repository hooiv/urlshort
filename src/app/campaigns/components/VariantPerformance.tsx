'use client'

import type { Variant } from './types'
import { clampPercent, formatCvr, formatMoney, variantAllocation } from './campaignLogic'
import { formatNumber } from '@/lib/format'

export function VariantPerformance({
  variant,
  totalClicks,
  currency,
}: {
  variant: Variant
  totalClicks: number
  currency: string
}) {
  const cvr = variant.clicks ? variant.conversions / variant.clicks : 0
  const allocation = variantAllocation(variant, totalClicks)
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-200">{variant.name}</span>
            {variant.isControl && (
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
                CONTROL
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-slate-600">{variant.destinationUrl}</p>
        </div>
        <span className="font-mono text-sm text-blue-300">{variant.weight}%</span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-blue-500" style={{ width: `${clampPercent(allocation)}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-slate-600">Clicks</span>
          <div className="mt-1 font-semibold text-slate-200">{formatNumber(variant.clicks)}</div>
        </div>
        <div>
          <span className="text-slate-600">CVR</span>
          <div className="mt-1 font-semibold text-slate-200">{formatCvr(cvr)}</div>
        </div>
        <div>
          <span className="text-slate-600">Value</span>
          <div className="mt-1 font-semibold text-slate-200">{formatMoney(variant.valueCents, currency)}</div>
        </div>
      </div>
    </div>
  )
}
