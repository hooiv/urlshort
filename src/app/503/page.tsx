'use client'

import Link from 'next/link'
import { ArrowLeft, RefreshCw, ServerCrash } from 'lucide-react'

export default function ServiceUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center shadow-2xl backdrop-blur-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <ServerCrash className="h-7 w-7" />
        </div>
        <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
          HTTP 503
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">Temporary Gateway Anomaly</h1>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          The destination server is taking too long to respond or experiencing downtime. The link is valid — please retry in a few seconds.
        </p>

        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <button
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload()
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-xs font-semibold text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20 transition"
          >
            <RefreshCw className="h-4 w-4" /> Retry Destination
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Return Home
          </Link>
        </div>
      </div>
    </main>
  )
}
