import Link from 'next/link'
import { ArrowLeft, Globe2 } from 'lucide-react'

export const metadata = { title: 'Unavailable in your region', robots: { index: false } }

export default function RegionUnavailablePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-400">
          <Globe2 className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">Not available in your region</h1>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          The owner of this link has restricted it to certain countries.
        </p>
        <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition">
          <ArrowLeft className="h-3.5 w-3.5" /> Return Home
        </Link>
      </div>
    </main>
  )
}
