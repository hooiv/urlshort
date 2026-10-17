'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'

type Status = { enabled: boolean; recoveryCodesRemaining?: number }

async function call(body: Record<string, unknown>) {
  const response = await fetch('/api/account/mfa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data as Record<string, unknown>
}

export default function TwoFactorSection() {
  const [status, setStatus] = useState<Status | null>(null)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [recovery, setRecovery] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch('/api/account/mfa')
    if (response.ok) setStatus((await response.json()) as Status)
  }, [])
  useEffect(() => {
    let live = true
    void fetch('/api/account/mfa')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d) setStatus(d as Status) })
    return () => { live = false }
  }, [])

  async function run(action: string, after: (data: Record<string, unknown>) => void | Promise<void>) {
    setBusy(true)
    try {
      after(await call({ action, password, code: code.trim() }))
      setCode('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const start = (event: FormEvent) => {
    event.preventDefault()
    void run('setup', async (data) => {
      const uri = String(data.otpauthUri)
      setSetup({ secret: String(data.secret), qr: await QRCode.toDataURL(uri, { margin: 1, width: 192 }) })
      setPassword('')
    })
  }
  const enable = (event: FormEvent) => {
    event.preventDefault()
    void run('enable', async (data) => {
      setRecovery(data.recoveryCodes as string[])
      setSetup(null)
      toast.success('Two-factor authentication enabled')
      await load()
    })
  }
  const disable = () => void run('disable', async () => {
    toast.success('Two-factor authentication disabled')
    setPassword('')
    await load()
  })
  const regenerate = () => void run('recovery', (data) => {
    setRecovery(data.recoveryCodes as string[])
    setPassword('')
    void load()
  })

  if (!status) return null
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="font-semibold">Two-factor authentication</h2>
      <p className="mt-1 text-xs text-slate-500">
        {status.enabled
          ? `Enabled. ${status.recoveryCodesRemaining ?? 0} recovery codes remaining.`
          : 'Protect sign-in with a code from an authenticator app (Google Authenticator, 1Password, Authy).'}
      </p>
      {recovery && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-xs text-amber-200">Save these recovery codes now. Each works once and they will not be shown again.</p>
          <pre className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm text-amber-100">{recovery.join('\n')}</pre>
          <button onClick={() => setRecovery(null)} className="mt-3 text-xs text-amber-300 underline">I saved them</button>
        </div>
      )}
      {!status.enabled && !setup && (
        <form onSubmit={start} className="mt-5 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-2 block text-xs text-slate-400">Confirm password</span>
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" autoComplete="current-password" />
          </label>
          <button disabled={busy} className="rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold hover:bg-blue-400 disabled:opacity-60">Set up</button>
        </form>
      )}
      {setup && (
        <form onSubmit={enable} className="mt-5 flex flex-wrap items-start gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="Authenticator QR code" width={192} height={192} className="rounded-lg bg-white" />
          <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-400">Scan the code, or enter this key manually:</p>
            <code className="block break-all rounded bg-slate-950 px-3 py-2 text-xs">{setup.secret}</code>
            <input required inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" className="input" />
            <button disabled={busy} className="rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold hover:bg-blue-400 disabled:opacity-60">Verify and enable</button>
          </div>
        </form>
      )}
      {status.enabled && (
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-2 block text-xs text-slate-400">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" autoComplete="current-password" />
          </label>
          <label className="block text-sm">
            <span className="mb-2 block text-xs text-slate-400">Authenticator or recovery code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} className="input" autoComplete="one-time-code" maxLength={24} />
          </label>
          <button disabled={busy || !password || !code} onClick={regenerate} className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold hover:bg-slate-700 disabled:opacity-50">New recovery codes</button>
          <button disabled={busy || !password || !code} onClick={disable} className="rounded-xl bg-red-600/80 px-4 py-2.5 text-sm font-semibold hover:bg-red-500 disabled:opacity-50">Disable</button>
        </div>
      )}
    </section>
  )
}
