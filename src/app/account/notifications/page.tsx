'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, Mail } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

type Prefs = { weeklyDigest: boolean; milestoneAlerts: boolean; lastSentAt: string | null; emailVerified: boolean }

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void fetch('/api/account/notifications')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load preferences'))))
      .then(setPrefs)
      .catch((e: Error) => toast.error(e.message))
  }, [])

  async function toggle(key: 'weeklyDigest' | 'milestoneAlerts', next: boolean) {
    setBusy(true)
    try {
      const r = await fetch('/api/account/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: next }) })
      const data = await r.json().catch(() => null)
      if (!r.ok) throw new Error(data?.error || 'Could not save')
      setPrefs((p) => (p ? { ...p, [key]: next } : p))
      toast.success(next ? 'Notification on' : 'Notification off')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Toaster position="top-right" />
      <header className="border-b border-slate-800">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <Link href="/account" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Account</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <div className="flex items-center gap-3"><Mail className="h-6 w-6 text-blue-300" /><h1 className="text-3xl font-semibold">Email notifications</h1></div>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="font-semibold">Weekly performance digest</h2>
          <p className="mt-1 text-xs text-slate-500">Mondays 08:00 UTC: clicks, conversions and revenue for the last 7 days versus the week before, plus your top links. Skipped when there was no activity.</p>
          {prefs && !prefs.emailVerified && <p className="mt-3 text-xs text-amber-400">Verify your email address to enable this.</p>}
          <label className="mt-4 flex items-center gap-3 text-sm">
            <input type="checkbox" disabled={!prefs || busy || (!prefs.emailVerified && !prefs.weeklyDigest)} checked={prefs?.weeklyDigest ?? false} onChange={(e) => void toggle('weeklyDigest', e.target.checked)} />
            Email me every week
          </label>
          {prefs?.lastSentAt && <p className="mt-3 text-xs text-slate-500">Last sent {new Date(prefs.lastSentAt).toLocaleDateString()}</p>}
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="font-semibold">Click milestone alerts</h2>
          <p className="mt-1 text-xs text-slate-500">One email when a link first reaches 100, 1k, 10k, 100k or 1M clicks. Checked hourly; links already past a milestone are not announced.</p>
          <label className="mt-4 flex items-center gap-3 text-sm">
            <input type="checkbox" disabled={!prefs || busy || (!prefs.emailVerified && !prefs.milestoneAlerts)} checked={prefs?.milestoneAlerts ?? false} onChange={(e) => void toggle('milestoneAlerts', e.target.checked)} />
            Email me on milestones
          </label>
        </section>
      </main>
    </div>
  )
}
