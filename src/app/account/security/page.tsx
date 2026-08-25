'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Laptop, LogOut, ShieldCheck } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

type Session = { id: string; userAgent: string | null; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean }

function label(userAgent: string | null) {
  if (!userAgent) return 'Unknown device'
  if (/iphone|android/i.test(userAgent)) return 'Mobile device'
  if (/windows/i.test(userAgent)) return 'Windows device'
  if (/mac os/i.test(userAgent)) return 'Mac device'
  return 'Browser session'
}

export default function SecurityPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  async function load() { const response = await fetch('/api/auth/sessions'); if (!response.ok) return; setSessions(await response.json()); setLoading(false) }
  useEffect(() => { void load() }, [])
  async function revoke(sessionId?: string) {
    const response = await fetch('/api/auth/sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sessionId ? { sessionId } : {}) })
    const data = await response.json(); if (!response.ok) return toast.error(data.error || 'Could not revoke sessions')
    toast.success(sessionId ? 'Session revoked' : `Revoked ${data.revoked} other sessions`); await load()
  }
  return <div className="min-h-screen bg-slate-950 text-slate-100"><Toaster position="top-right"/><header className="border-b border-slate-800"><div className="mx-auto max-w-4xl px-6 py-5"><Link href="/account" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4"/> Account</Link></div></header><main className="mx-auto max-w-4xl space-y-6 px-6 py-10"><div><div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-blue-300"/><h1 className="text-3xl font-semibold">Session security</h1></div><p className="mt-2 text-sm text-slate-500">Review where your account is signed in and revoke anything you do not recognize.</p></div><section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"><div className="mb-5 flex items-center justify-between"><h2 className="font-semibold">Active sessions</h2><button onClick={() => void revoke()} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">Sign out everywhere else</button></div>{loading ? <p className="text-sm text-slate-500">Loading sessions…</p> : <div className="space-y-3">{sessions.map((session) => <div key={session.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="flex min-w-0 items-center gap-3"><Laptop className="h-5 w-5 shrink-0 text-slate-500"/><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-medium">{label(session.userAgent)}{session.current && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">Current</span>}</div><div className="mt-1 text-xs text-slate-600">Last seen {new Date(session.lastSeenAt).toLocaleString()} · Created {new Date(session.createdAt).toLocaleDateString()}</div></div></div>{!session.current && <button onClick={() => void revoke(session.id)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:border-red-400 hover:text-red-300"><LogOut className="h-3.5 w-3.5"/> Revoke</button>}</div>)}</div>}</section>
    <PasswordSection />
  </main></div>
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (newPassword !== confirmPassword) return toast.error('New passwords do not match')
    setBusy(true)
    try {
      const response = await fetch('/api/account/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not change password')
      toast.success('Password changed — other sessions were signed out')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not change password') } finally { setBusy(false) }
  }

  return <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
    <h2 className="font-semibold">Change password</h2>
    <p className="mt-1 text-xs text-slate-500">Changing your password signs out every other session immediately.</p>
    <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-3">
      <label className="block text-sm"><span className="mb-2 block text-xs text-slate-400">Current password</span><input required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input" autoComplete="current-password" /></label>
      <label className="block text-sm"><span className="mb-2 block text-xs text-slate-400">New password (12+ chars)</span><input required type="password" minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" autoComplete="new-password" /></label>
      <label className="block text-sm"><span className="mb-2 block text-xs text-slate-400">Confirm new password</span><input required type="password" minLength={12} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" autoComplete="new-password" /></label>
      <div className="sm:col-span-3"><button disabled={busy} className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold hover:bg-blue-400 disabled:opacity-60">{busy ? 'Updating…' : 'Update password'}</button></div>
    </form>
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
  </section>
}
