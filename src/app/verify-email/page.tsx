'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Toaster } from 'react-hot-toast'
import VerifyEmailCard from '@/app/verify-email/components/VerifyEmailCard'
import { useVerifyEmail } from '@/app/verify-email/components/useVerifyEmail'

function VerifyEmailInner() {
  const params = useSearchParams()
  const token = params.get('token') || ''
  const { status, error } = useVerifyEmail(token)

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <Toaster position="top-right" />
      <VerifyEmailCard status={status} error={error} />
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">Loading…</div>}>
      <VerifyEmailInner />
    </Suspense>
  )
}
