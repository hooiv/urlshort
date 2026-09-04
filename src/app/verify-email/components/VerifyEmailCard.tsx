'use client'

import Link from 'next/link'
import { ArrowLeft, MailCheck } from 'lucide-react'
import type { VerifyStatus } from '@/app/verify-email/components/verify-logic'

interface Props {
  status: VerifyStatus
  error: string | null
}

export default function VerifyEmailCard({ status, error }: Props) {
  return (
    <div className="w-full max-w-md text-center">
      <Link href="/account" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to QuickLink
      </Link>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10">
        <MailCheck
          className={`mx-auto h-12 w-12 ${status === 'success' ? 'text-emerald-400' : status === 'error' ? 'text-red-400' : 'text-blue-300'}`}
        />
        {status === 'verifying' && (
          <>
            <h1 className="mt-5 text-xl font-semibold">Verifying your email…</h1>
            <p className="mt-2 text-sm text-slate-500">This only takes a moment.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <h1 className="mt-5 text-xl font-semibold text-emerald-300">Email verified</h1>
            <p className="mt-2 text-sm text-slate-500">Your account is fully activated. Redirecting you to your account…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="mt-5 text-xl font-semibold text-red-300">Verification failed</h1>
            <p className="mt-2 text-sm text-slate-500">{error} You can request a new link from your account page.</p>
            <Link href="/account" className="mt-6 inline-flex rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold hover:bg-blue-400">
              Go to account
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
