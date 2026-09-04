'use client'

import type { QrErrorLevel } from './qrOptions'

export default function PrecisionControls({
  errorLevel,
  margin,
  onErrorLevel,
  onMargin,
}: {
  errorLevel: QrErrorLevel
  margin: number
  onErrorLevel: (level: QrErrorLevel) => void
  onMargin: (margin: number) => void
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h3 className="font-semibold text-white text-sm mb-3">Precision & Redundancy</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Error Correction Level</label>
          <select
            value={errorLevel}
            onChange={(e) => onErrorLevel(e.target.value as QrErrorLevel)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
          >
            <option value="L">Low (7% recovery)</option>
            <option value="M">Medium (15% recovery)</option>
            <option value="Q">Quartile (25% recovery)</option>
            <option value="H">High (30% recovery - Recommended)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Quiet Zone Margin</label>
          <select
            value={margin}
            onChange={(e) => onMargin(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
          >
            <option value={0}>0 Modules (Border flush)</option>
            <option value={1}>1 Module</option>
            <option value={2}>2 Modules (Standard)</option>
            <option value={4}>4 Modules (ISO Standard)</option>
          </select>
        </div>
      </div>
    </section>
  )
}
