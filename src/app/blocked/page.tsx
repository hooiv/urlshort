import Link from 'next/link'
import { ArrowLeft, ShieldAlert, ShieldCheck } from 'lucide-react'

export default function BlockedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-900/70 p-8 text-center shadow-2xl backdrop-blur-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-red-300">
          Safety Quarantine
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">Destination Blocked</h1>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          The destination associated with this link was quarantined by automated security filters due to potential malware, phishing, or violation of our safety policies.
        </p>

        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/abuse"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-5 py-3 text-xs font-semibold text-white hover:bg-red-600 shadow-lg shadow-red-500/20 transition"
          >
            <ShieldCheck className="h-4 w-4" /> Safety Portal
          </Link>
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
