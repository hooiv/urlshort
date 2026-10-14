'use client'

import { useState } from 'react'
import { Route, AlertTriangle } from 'lucide-react'
import type { TraceResult } from '@/lib/redirect-trace'

export default function RedirectTracePage() {
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<TraceResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function run(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/links/trace?url=${encodeURIComponent(url.trim())}`)
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Trace failed')
      else setResult(data as TraceResult)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Route className="h-6 w-6" /> Redirect tracer</h1>
      <p className="text-sm text-muted-foreground">Follow a URL hop by hop to see status codes, latency, loops and https downgrades.</p>
      <form onSubmit={run} className="flex gap-2">
        <input
          aria-label="URL to trace"
          className="flex-1 rounded border px-3 py-2 text-sm"
          placeholder="https://example.com/short"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={2048}
          required
        />
        <button disabled={loading} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">{loading ? 'Tracing…' : 'Trace'}</button>
      </form>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {result && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <span>{result.hops.length} hop(s)</span>
            <span>{result.totalMs} ms total</span>
            {result.loop && <span className="flex items-center gap-1 text-red-600"><AlertTriangle className="h-4 w-4" /> Redirect loop</span>}
            {result.insecureDowngrade && <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-4 w-4" /> https → http downgrade</span>}
            {result.truncated && <span className="text-amber-600">Stopped at hop limit</span>}
          </div>
          <ol className="space-y-2">
            {result.hops.map((h, i) => (
              <li key={i} className="rounded border p-3 text-sm">
                <div className="break-all font-mono">{h.url}</div>
                <div className="text-muted-foreground">{h.status ?? 'no response'} · {h.latencyMs} ms{h.error ? ` · ${h.error}` : ''}</div>
              </li>
            ))}
          </ol>
          <p className="text-sm">Final: <span className="break-all font-mono">{result.finalUrl}</span></p>
        </section>
      )}
    </main>
  )
}
