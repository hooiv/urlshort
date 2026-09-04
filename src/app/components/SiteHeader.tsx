'use client'

import Link from 'next/link'
import { Link2, Search } from 'lucide-react'

export default function SiteHeader() {
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-30">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
            <Link2 className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">QuickLink</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="hidden md:flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            Search...
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500">⌘K</span>
          </button>

          <div className="h-4 w-px bg-slate-800 hidden sm:block"></div>

          <Link
            href="/bulk"
            className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white"
          >
            Bulk Import
          </Link>
          <Link
            href="/manage/bio"
            className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Bio Pages
          </Link>
          <Link
            href="/manage/webhooks"
            className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Webhooks
          </Link>
          <Link
            href="/account"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Account & Dashboard
          </Link>
        </div>
      </div>
    </header>
  )
}
