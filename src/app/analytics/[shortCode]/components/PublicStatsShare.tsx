'use client'

import { useEffect, useState } from 'react'

/** Enable, copy, rotate or revoke the public read-only stats page for a link. The token is shown once. */
export default function PublicStatsShare({ shortCode }: { shortCode: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const endpoint = `/api/links/${encodeURIComponent(shortCode)}/public-stats`

  useEffect(() => {
    const controller = new AbortController()
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load sharing state')
        setEnabled((await res.json()).enabled)
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [endpoint])

  async function act(method: 'POST' | 'DELETE') {
    if (method === 'POST' && enabled && !window.confirm('Rotating invalidates the current share link. Continue?')) return
    setBusy(true); setError(null); setCopied(false)
    try {
      const res = await fetch(endpoint, { method })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Request failed')
      setEnabled(body.enabled)
      setUrl(body.path ? `${window.location.origin}${body.path}` : null)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6" aria-label="Public stats link">
      <h2 className="text-lg font-semibold text-white">Share stats publicly</h2>
      <p className="mt-1 text-sm text-slate-400">A read-only page with aggregate numbers only. No IPs, no raw clicks. Revoke any time.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
      {url && (
        <div className="mt-4 flex gap-2">
          <input readOnly value={url} aria-label="Public stats URL" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" onFocus={(e) => e.currentTarget.select()} />
          <button onClick={copy} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700">{copied ? 'Copied' : 'Copy'}</button>
        </div>
      )}
      {enabled && !url && <p className="mt-3 text-sm text-slate-400">Sharing is on. The link is only shown when created; rotate to get a new one.</p>}
      <div className="mt-4 flex gap-2">
        <button disabled={busy || enabled === null} onClick={() => act('POST')} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">{enabled ? 'Rotate link' : 'Create public link'}</button>
        {enabled && <button disabled={busy} onClick={() => act('DELETE')} className="rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50">Revoke</button>}
      </div>
    </section>
  )
}
