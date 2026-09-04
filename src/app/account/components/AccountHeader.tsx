'use client'

import Link from 'next/link'
import { ArrowLeft, LogOut } from 'lucide-react'

export default function AccountHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="border-b border-slate-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> QuickLink
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/status"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500"
          >
            Status
          </Link>
          <Link
            href="/api-docs"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500"
          >
            API Docs
          </Link>
          <Link
            href="/abuse"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500"
          >
            Trust &amp; Safety
          </Link>
          <Link
            href="/workspaces"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500"
          >
            Workspaces
          </Link>
          <Link
            href="/audit"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500"
          >
            Audit log
          </Link>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
