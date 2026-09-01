/* eslint-disable react-hooks/set-state-in-effect -- remote/session synchronization occurs after mount. */
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe2,
  Lock,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

interface Domain {
  id: string
  host: string
  status: 'pending' | 'verified' | 'disabled'
  verificationToken: string
  verifiedAt: string | null
  tlsReady: boolean
}

interface Binding {
  id: string
  path: string
  domain: Domain
}

interface ApiResponse {
  verified: boolean
  domain: Domain
  dns?: {
    name: string
    type: string
    value: string
    cname: { name: string; type: string; value: string }
  }
  link?: { id: string; path: string }
}

export default function BrandedDomainsPage() {
  const { shortCode } = useParams<{ shortCode: string }>()
  const [token, setToken] = useState<string | null>(null)
  const [host, setHost] = useState('')
  const [path, setPath] = useState(`/${shortCode}`)
  const [bindings, setBindings] = useState<Binding[]>([])
  const [dns, setDns] = useState<ApiResponse['dns'] | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    setToken(sessionStorage.getItem(`ql-token:${shortCode}`))
  }, [shortCode])

  const load = useCallback(async () => {
    if (!token) return
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/domains`, {
        headers: { 'x-management-token': token },
      })
      const data = await response.json()
      if (!response.ok) return toast.error(data.error || 'Could not load domains')
      setBindings(data)
    } catch {
      toast.error('Network error loading domain bindings')
    }
  }, [shortCode, token])

  useEffect(() => {
    if (token) void load()
  }, [token, load])

  async function addDomain(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    if (!host.trim()) return toast.error('Enter a domain host')
    setWorking(true)
    setDns(null)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({ host: host.trim().toLowerCase(), path: path.trim() }),
      })
      const data = (await response.json()) as ApiResponse
      if (!response.ok) throw new Error((data as unknown as { error?: string }).error || 'Could not add domain')

      if (!data.verified) {
        setDns(data.dns || null)
        toast.success('Domain registered; publish the DNS records below to verify ownership')
      } else {
        await load()
        toast.success('Branded domain connected and verified')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add domain')
    } finally {
      setWorking(false)
    }
  }

  async function verify() {
    if (!token || !host) return
    setWorking(true)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/domains`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({ host: host.trim().toLowerCase(), path: path.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'DNS verification check failed')
      await load()
      setDns(null)
      toast.success('Domain ownership verified! Your branded link is active.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Verification failed')
    } finally {
      setWorking(false)
    }
  }

  async function remove(binding: Binding) {
    if (!token || !window.confirm(`Remove ${binding.domain.host}${binding.path}?`)) return
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/domains`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({ host: binding.domain.host, path: binding.path }),
      })
      if (!response.ok) return toast.error((await response.json()).error || 'Could not remove domain')
      await load()
      toast.success('Branded domain binding removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove domain')
    }
  }

  if (!token) return <AccessDenied shortCode={shortCode} />

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/manage/${shortCode}`}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
              title="Return to Campaign Controls"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-blue-400" />
                <span className="font-semibold text-white">Custom Branded Domains</span>
                <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[11px] text-blue-400">
                  /{shortCode}
                </span>
              </div>
              <p className="text-xs text-slate-500">Route through your own domain with full edge routing and analytics</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/manage/${shortCode}/qr`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
            >
              <QrCode className="h-3.5 w-3.5" /> QR Studio
            </Link>
            <a
              href={`/${shortCode}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-400"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Test Link
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* Banner */}
        <section className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <ShieldCheck className="h-4 w-4" /> Enterprise Brand Identity
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white">
            Use your own branded domain. Keep all smart routing.
          </h1>
          <p className="mt-2 text-sm text-slate-400 max-w-3xl leading-relaxed">
            Connect any custom hostname (e.g. <code className="font-mono text-blue-300">go.yourcompany.com</code>), verify DNS ownership, and serve short links from your primary brand with zero infrastructure management.
          </p>
        </section>

        {/* Add Domain Form */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Connect New Branded Domain</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter your subdomain or apex domain and the custom backhalf path.
            </p>
          </div>

          <form onSubmit={addDomain} className="grid gap-4 sm:grid-cols-[1fr_220px_auto]">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Hostname</label>
              <input
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="e.g. go.yourcompany.com"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Path</label>
              <input
                required
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder={`/${shortCode}`}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="flex items-end">
              <button
                disabled={working}
                className="w-full sm:w-auto rounded-xl bg-blue-500 px-6 py-3 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-400 disabled:opacity-60 transition"
              >
                {working ? 'Processing…' : 'Connect Domain'}
              </button>
            </div>
          </form>
        </section>

        {/* DNS Configuration Cards */}
        {dns && (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-5 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <TriangleAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-semibold text-white text-base">Required DNS Records for {host}</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Add these records in your DNS provider (Cloudflare, AWS Route53, GoDaddy, Namecheap) to verify domain ownership.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DnsRecordCard
                type="TXT Record (Verification)"
                name={dns.name}
                value={dns.value}
                desc="Proves domain ownership"
              />
              <DnsRecordCard
                type="CNAME Record (Routing)"
                name={dns.cname.name}
                value={dns.cname.value}
                desc="Routes traffic through QuickLink edge"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => void verify()}
                disabled={working}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition shadow-lg shadow-amber-500/20"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${working ? 'animate-spin' : ''}`} />
                {working ? 'Checking DNS Propagation…' : 'Verify DNS Ownership'}
              </button>
            </div>
          </section>
        )}

        {/* Connected Domains List */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-semibold">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span>Active Branded Domain Bindings</span>
            </div>
            <span className="text-xs font-mono text-slate-500">{bindings.length} Connected</span>
          </div>

          <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
            {bindings.length > 0 ? (
              bindings.map((binding) => (
                <div
                  key={binding.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white">
                        https://{binding.domain.host}{binding.path}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                          binding.domain.status === 'verified'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {binding.domain.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5">
                      <span className="flex items-center gap-1">
                        <Lock className="h-3 w-3 text-emerald-400" /> Auto SSL / TLS
                      </span>
                      <span>·</span>
                      <span>Target: /{shortCode}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        const url = `https://${binding.domain.host}${binding.path}`
                        void navigator.clipboard.writeText(url)
                        toast.success('Branded URL copied!')
                      }}
                      className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-700"
                    >
                      <Copy className="h-3.5 w-3.5 inline mr-1" /> Copy URL
                    </button>

                    <button
                      onClick={() => void remove(binding)}
                      className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                      title="Remove domain binding"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-10 text-center text-xs text-slate-500">
                No branded domain bindings connected yet. Add one above to serve links from your domain.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function DnsRecordCard({
  type,
  name,
  value,
  desc,
}: {
  type: string
  name: string
  value: string
  desc: string
}) {
  function copy(text: string) {
    void navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-amber-300">{type}</span>
        <span className="text-[10px] text-slate-500">{desc}</span>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
          <span>Host / Name</span>
          <button onClick={() => copy(name)} className="text-slate-500 hover:text-white">
            <Copy className="h-3 w-3" />
          </button>
        </div>
        <code className="block rounded-lg bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-200 truncate">
          {name}
        </code>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
          <span>Points to / Value</span>
          <button onClick={() => copy(value)} className="text-slate-500 hover:text-white">
            <Copy className="h-3 w-3" />
          </button>
        </div>
        <code className="block rounded-lg bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-200 truncate">
          {value}
        </code>
      </div>
    </div>
  )
}

function AccessDenied({ shortCode }: { shortCode: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-500" />
        <h1 className="mt-4 text-xl font-semibold">Private Domain Studio</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Open this page with the management token for <span className="font-mono">/{shortCode}</span>.
        </p>
        <Link
          href={`/manage/${shortCode}`}
          className="mt-6 inline-flex rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-400"
        >
          Back to Campaign Controls
        </Link>
      </div>
    </div>
  )
}
