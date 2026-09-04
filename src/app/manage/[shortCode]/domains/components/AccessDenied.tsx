'use client'

import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

export default function AccessDenied({ shortCode }: { shortCode: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-500" />
        <h1 className="mt-4 text-xl font-semibold">Private Domain Studio</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Open this page with the management token for <span className="font-mono">/{shortCode}</span>.
        </p>
        <Link
          href={`/manage/${shortCode}`}
          className="mt-6 inline-flex rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-400"
        >
          Back to Campaign Controls
        </Link>
      </div>
    </div>
  )
}
