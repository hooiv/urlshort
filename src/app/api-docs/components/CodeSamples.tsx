'use client'

import { Code2, Copy } from 'lucide-react'
import { LANG_TABS } from '@/app/api-docs/components/apiCatalog'
import type { LangTab } from '@/app/api-docs/components/apiCatalog'

interface CodeSamplesProps {
  snippet: string
  langTab: LangTab
  onTabChange: (tab: LangTab) => void
  onCopy: (text: string) => void
}

/** SDK code generation panel with per-language tabs. */
export default function CodeSamples({ snippet, langTab, onTabChange, onCopy }: CodeSamplesProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <Code2 className="h-4 w-4 text-blue-400" />
          <span>SDK Code Generation</span>
        </div>

        <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
          {LANG_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`rounded px-2.5 py-1 uppercase text-[10px] font-bold transition ${
                langTab === tab ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-300">
          <code>{snippet}</code>
        </pre>
        <button
          onClick={() => onCopy(snippet)}
          className="absolute right-3 top-3 rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:text-white"
          title="Copy code"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  )
}
