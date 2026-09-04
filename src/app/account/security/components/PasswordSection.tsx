'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { validatePasswordChange } from '@/app/account/security/components/session-utils'

export default function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const error = validatePasswordChange({ currentPassword, newPassword, confirmPassword })
    if (error) return toast.error(error)
    setBusy(true)
    try {
      const response = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not change password')
      toast.success('Password changed — other sessions were signed out')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="font-semibold">Change password</h2>
      <p className="mt-1 text-xs text-slate-500">Changing your password signs out every other session immediately.</p>
      <form onSubmit={(e) => void submit(e)} className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-2 block text-xs text-slate-400">Current password</span>
          <input
            required
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="input"
            autoComplete="current-password"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-2 block text-xs text-slate-400">New password (12+ chars)</span>
          <input
            required
            type="password"
            minLength={12}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input"
            autoComplete="new-password"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-2 block text-xs text-slate-400">Confirm new password</span>
          <input
            required
            type="password"
            minLength={12}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input"
            autoComplete="new-password"
          />
        </label>
        <div className="sm:col-span-3">
          <button
            disabled={busy}
            className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold hover:bg-blue-400 disabled:opacity-60"
          >
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </section>
  )
}
