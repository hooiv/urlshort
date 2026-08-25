'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { Toaster } from 'react-hot-toast'

function VerifyEmailInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''
  const [state, setState] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setState('error')
      setError('This link is missing its verification token.')
      return
    }
    fetch('/api/auth/verify/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Verification failed')
        setState('success')
        setTimeout(() => router.push('/account'), 2000)
      })
      .catch((err) => {
        setState('error')
        setError(err instanceof Error ? err.message : 'Verification failed')
      })
  }, [token, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <Toaster position="top-right" />
      <div className="w-full max-w-md text-center">
        <Link href="/account" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to QuickLink</Link>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10">
          <MailCheck className={`mx-auto h-12 w-12 ${state === 'success' ? 'text-emerald-400' : state === 'error' ? 'text-red-400' : 'text-blue-300'}`} />
          {state === 'verifying' && <><h1 className="mt-5 text-xl font-semibold">Verifying your email…</h1><p className="mt-2 text-sm text-slate-500">This only takes a moment.</p></>}
          {state === 'success' && <><h1 className="mt-5 text-xl font-semibold text-emerald-300">Email verified</h1><p className="mt-2 text-sm text-slate-500">Your account is fully activated. Redirecting you to your account…</p></>}
          {state === 'error' && <><h1 className="mt-5 text-xl font-semibold text-red-300">Verification failed</h1><p className="mt-2 text-sm text-slate-500">{error} You can request a new link from your account page.</p><Link href="/account" className="mt-6 inline-flex rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold hover:bg-blue-400">Go to account</Link></>}
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">Loading…</div>}><VerifyEmailInner /></Suspense>
}
