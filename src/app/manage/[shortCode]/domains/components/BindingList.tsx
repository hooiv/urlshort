'use client'

import { CheckCircle2, Copy, Lock, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { buildBrandedUrl } from './domainValidation'
import type { Binding } from './types'

async function copyBrandedUrl(url: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
    } else {
      const area = document.createElement('textarea')
      area.value = url
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    toast.success('Branded URL copied!')
  } catch {
    toast.error('Could not copy to clipboard')
  }
}

export default function BindingList({
  bindings,
  shortCode,
  onRemove,
}: {
  bindings: Binding[]
  shortCode: string
  onRemove: (binding: Binding) => void
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white font-semibold">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <span>Active Branded Domain Bindings</span>
        </div>
        <span className="text-xs font-mono text-slate-500">{bindings.length} Connected</span>
      </div>

      <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
        {bindings.length > 0 ? (
          bindings.map((binding) => (
            <div
              key={binding.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-white">
                    https://{binding.domain.host}{binding.path}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                      binding.domain.status === 'verified'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {binding.domain.status}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5">
                  <span className="flex items-center gap-1">
                    <Lock className="h-3 w-3 text-emerald-400" /> Auto SSL / TLS
                  </span>
                  <span>·</span>
                  <span>Target: /{shortCode}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => void copyBrandedUrl(buildBrandedUrl(binding.domain.host, binding.path))}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-700"
                >
                  <Copy className="h-3.5 w-3.5 inline mr-1" /> Copy URL
                </button>

                <button
                  onClick={() => onRemove(binding)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                  title="Remove domain binding"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="p-10 text-center text-xs text-slate-500">
            No branded domain bindings connected yet. Add one above to serve links from your domain.
          </div>
        )}
      </div>
    </section>
  )
}
