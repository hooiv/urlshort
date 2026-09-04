'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import Field from '@/app/account/components/Field'
import type { AuthMode, User } from '@/app/account/components/types'
import { normalizeEmail, validateAuthInput } from '@/app/account/components/account-utils'

export default function AuthForm({
  inviteToken,
  invitedEmail,
  onSignedIn,
}: {
  inviteToken: string | null
  invitedEmail: string | null
  onSignedIn: (user: User) => Promise<void>
}) {
  const [mode, setMode] = useState<AuthMode>('login')
  // Prefill the email so the invitee signs in with the invited address.
  const [email, setEmail] = useState(invitedEmail ?? '')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [showReset, setShowReset] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const error = validateAuthInput({ mode, email, password, name })
    if (error) return toast.error(error)
    setBusy(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body =
        mode === 'login'
          ? { email: normalizeEmail(email), password }
          : { email: normalizeEmail(email), password, name: name.trim() }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Authentication failed')
      toast.success(mode === 'login' ? 'Signed in' : 'Account created')
      setPassword('')
      setEmail('')
      setName('')
      await onSignedIn(data.user)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  async function requestReset(event: FormEvent) {
    event.preventDefault()
    const trimmed = resetEmail.trim()
    if (!trimmed) return toast.error('Enter your account email')
    setResetBusy(true)
    try {
      const response = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      if (!response.ok) throw new Error('Could not send reset email')
      toast.success('If that account exists, a reset link has been sent (check the server logs in development)')
      setShowReset(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send reset email')
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <Toaster position="top-right" />
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to QuickLink
        </Link>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-blue-300" />
            <div>
              <h1 className="text-xl font-semibold">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
              <p className="text-xs text-slate-500">
                {inviteToken
                  ? 'Sign in to accept your workspace invitation.'
                  : 'Own and manage your campaign infrastructure.'}
              </p>
            </div>
          </div>
          {inviteToken && (
            <p className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-xs text-blue-200">
              You have a pending workspace invitation — sign in (or create an account with the invited email) and it
              will be accepted automatically.
            </p>
          )}
          <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4">
            {mode === 'register' && (
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={80} />
              </Field>
            )}
            <Field label="Email">
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Password">
              <input
                required
                type="password"
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </Field>
            <button
              disabled={busy}
              className="w-full rounded-xl bg-blue-500 px-4 py-3 font-semibold hover:bg-blue-400 disabled:opacity-60"
            >
              {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          {mode === 'login' && (
            <button
              onClick={() => setShowReset((value) => !value)}
              className="mt-3 w-full text-xs text-slate-500 hover:text-slate-300"
            >
              Forgot password?
            </button>
          )}
          {showReset && (
            <form
              onSubmit={(e) => void requestReset(e)}
              className="mt-4 flex gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3"
            >
              <input
                required
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="Your account email"
                className="input flex-1"
              />
              <button
                disabled={resetBusy}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-60"
              >
                {resetBusy ? '…' : 'Send link'}
              </button>
            </form>
          )}
          <button
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="mt-5 w-full text-sm text-slate-500 hover:text-slate-300"
          >
            {mode === 'login' ? 'Create an account' : 'I already have an account'}
          </button>
          <p className="mt-5 text-[11px] leading-5 text-slate-600">
            In development, reset links are printed to the server console.
          </p>
        </div>
      </div>
    </div>
  )
}
