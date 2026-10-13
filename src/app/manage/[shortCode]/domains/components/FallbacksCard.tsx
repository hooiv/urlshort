'use client'

import { useEffect, useState } from 'react'
import { Route } from 'lucide-react'
import toast from 'react-hot-toast'

type Fallbacks = { rootRedirectUrl: string | null; notFoundUrl: string | null }

/** Root-domain redirect and 404 fallback for one verified branded domain. */
export default function FallbacksCard({ shortCode, host, token }: { shortCode: string; host: string; token: string }) {
  const base = `/api/links/${encodeURIComponent(shortCode)}/domain-settings?host=${encodeURIComponent(host)}`
  const [root, setRoot] = useState('')
  const [notFound, setNotFound] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetch(base, { headers: { 'x-management-token': token } })
      .then((response) => (response.ok ? (response.json() as Promise<Fallbacks>) : null))
      .then((data) => {
        if (cancelled || !data) return
        setRoot(data.rootRedirectUrl ?? '')
        setNotFound(data.notFoundUrl ?? '')
        setLoaded(true)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [base, token])

  async function save() {
    setSaving(true)
    try {
      const response = await fetch(base, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({ rootRedirectUrl: root.trim() || null, notFoundUrl: notFound.trim() || null }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not save')
      toast.success(`Fallbacks saved for ${host}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null
  const input = 'w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-600'
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div className="flex items-center gap-2 font-semibold text-white">
        <Route className="h-5 w-5 text-blue-400" />
        <span>Fallbacks for {host}</span>
      </div>
      <label className="block space-y-1 text-xs text-slate-400">
        <span>Where https://{host}/ should go</span>
        <input className={input} value={root} onChange={(event) => setRoot(event.target.value)} placeholder="https://yourcompany.com" />
      </label>
      <label className="block space-y-1 text-xs text-slate-400">
        <span>Where unknown short links on this domain should go</span>
        <input className={input} value={notFound} onChange={(event) => setNotFound(event.target.value)} placeholder="https://yourcompany.com/links-moved" />
      </label>
      <button disabled={saving} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
        {saving ? 'Saving…' : 'Save fallbacks'}
      </button>
    </section>
  )
}
