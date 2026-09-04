'use client'

import { Download } from 'lucide-react'
import { QR_DOWNLOAD_SIZES } from './qrOptions'

const SIZE_LABELS: Record<string, string> = {
  '512': '512px',
  '1024': '1024px',
  '2048': '2048px (2K)',
  '4096': '4096px (4K)',
}

export default function ExportHub({
  downloadSize,
  pngUrl,
  svgUrl,
  onDownloadSize,
}: {
  downloadSize: string
  pngUrl: string
  svgUrl: string
  onDownloadSize: (size: string) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <h3 className="font-semibold text-white text-sm">Download High-Resolution Asset</h3>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">PNG Resolution</label>
        <div className="grid grid-cols-4 gap-2">
          {QR_DOWNLOAD_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => onDownloadSize(size)}
              className={`rounded-xl border py-2 text-xs font-mono font-medium transition ${
                downloadSize === size
                  ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-white'
              }`}
            >
              {SIZE_LABELS[size] ?? `${size}px`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <a
          href={pngUrl}
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-400 transition"
        >
          <Download className="h-4 w-4" /> Download PNG ({downloadSize}px)
        </a>

        <a
          href={svgUrl}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white transition"
        >
          <Download className="h-4 w-4" /> Download Vector SVG
        </a>
      </div>
    </div>
  )
}
