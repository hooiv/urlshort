'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

function ResetPasswordForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => { if (!token) toast.error('Missing reset token — use the link from your email') }, [token])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirm) return toast.error('Passwords do not match')
    setBusy(true)
    try {
      const response = await fetch('/api/auth/reset/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not reset password')
      setDone(true)
      toast.success('Password reset — sign in with your new password')
      setTimeout(() => router.push('/account'), 1500)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not reset password') } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <Toaster position="top-right" />
      <div className="w-full max-w-md">
        <Link href="/account" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to QuickLink</Link>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-blue-300" /><h1 className="text-xl font-semibold">Choose a new password</h1></div>
          {done ? (
            <p className="mt-6 text-sm leading-6 text-slate-400">Your password has been reset and all sessions were signed out. Redirecting you to sign in…</p>
          ) : (
            <form onSubmit={submit} className="mt-7 space-y-4">
              <label className="block text-sm"><span className="mb-2 block text-xs text-slate-400">New password (12+ characters)</span><input required type="password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} className="input" autoComplete="new-password" /></label>
              <label className="block text-sm"><span className="mb-2 block text-xs text-slate-400">Confirm new password</span><input required type="password" minLength={12} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" autoComplete="new-password" /></label>
              <button disabled={busy || !token} className="w-full rounded-xl bg-blue-500 px-4 py-3 font-semibold hover:bg-blue-400 disabled:opacity-60">{busy ? 'Resetting…' : 'Reset password'}</button>
              {!token && <p className="text-xs text-red-400">This link is missing its reset token. Request a new one from the sign-in page.</p>}
            </form>
          )}
        </div>
      </div>
      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(51 65 85);
          background: rgb(15 23 42);
          padding: 0.65rem 0.85rem;
          font-size: 0.875rem;
          color: rgb(241 245 249);
          outline: none;
        }
        .input:focus {
          border-color: rgb(96 165 250);
          box-shadow: 0 0 0 3px rgb(59 130 246 / 0.15);
        }
      `}</style>
    </div>
  )
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">Loading…</div>}><ResetPasswordForm /></Suspense>
}
