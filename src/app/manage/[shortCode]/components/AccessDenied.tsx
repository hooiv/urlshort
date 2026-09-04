'use client'

import { ShieldCheck } from 'lucide-react'

export default function AccessDenied({ shortCode }: { shortCode: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-500" />
        <h1 className="mt-4 text-xl font-semibold">Private Campaign Controls</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Open the management URL for <span className="font-mono">/{shortCode}</span> or sign into your account to access controls.
        </p>
      </div>
    </div>
  )
}
