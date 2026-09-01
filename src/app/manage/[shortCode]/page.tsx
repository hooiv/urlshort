/* eslint-disable react-hooks/set-state-in-effect -- remote/session synchronization occurs after mount. */
'use client'
import RuleConflictGraph from '@/components/RuleConflictGraph'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowUpRight,
  BarChart3,
  Copy,
  Globe2,
  KeyRound,
  QrCode,
  Radio,
  RotateCcw,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

interface Rule {
  id: string
  name: string
  destinationUrl: string
  priority: number
  weight: number
  enabled: boolean
  countryCodes: string | null
  deviceType: string | null
  trafficType: string | null
  aiAgent: string | null
  os: string | null
  languageCodes: string | null
  referrerDomain: string | null
  startAt: string | null
  endAt: string | null
}

interface Revision {
  id: string
  destinationUrl: string
  reason: string | null
  effectiveAt: string
}

interface Form {
  name: string
  destinationUrl: string
  priority: string
  weight: string
  countryCodes: string
  deviceType: string
  trafficType: string
  aiAgent: string
  os: string
  languageCodes: string
  referrerDomain: string
  startAt: string
  endAt: string
}

const emptyForm: Form = {
  name: '',
  destinationUrl: '',
  priority: '100',
  weight: '100',
  countryCodes: '',
  deviceType: '',
  trafficType: '',
  aiAgent: '',
  os: '',
  languageCodes: '',
  referrerDomain: '',
  startAt: '',
  endAt: '',
}

type SocialPlatform = 'twitter' | 'facebook' | 'linkedin' | 'slack'

interface WebhookTestResponse {
  success: boolean
  statusCode?: number
  error?: string
  latencyMs?: number
  responseBodySnippet?: string
}

export default function ManageLink() {
  const router = useRouter()
  const { shortCode } = useParams<{ shortCode: string }>()
  const [token, setToken] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState<number | null>(null)
  useEffect(() => { setNowMs(Date.now()) }, [])

  // Remote data state
  const [rules, setRules] = useState<Rule[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])

  // Form states
  const [form, setForm] = useState<Form>(emptyForm)
  const [releaseUrl, setReleaseUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  // Metadata form state
  const [ogTitle, setOgTitle] = useState('')
  const [ogDesc, setOgDesc] = useState('')
  const [ogImage, setOgImage] = useState('')
  const [socialTab, setSocialTab] = useState<SocialPlatform>('twitter')

  // Expiration and protection states
  const [expiresAt, setExpiresAt] = useState('')
  const [expiredUrl, setExpiredUrl] = useState('')
  const [maxClicks, setMaxClicks] = useState('')
  const [password, setPassword] = useState('')
  const [hasPassword, setHasPassword] = useState(false)

  // Pixels & Cloaking
  const [metaPixelId, setMetaPixelId] = useState('')
  const [googleTagId, setGoogleTagId] = useState('')
  const [xPixelId, setXPixelId] = useState('')
  const [cloaked, setCloaked] = useState(false)

  // Webhooks
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookTestBusy, setWebhookTestBusy] = useState(false)
  const [webhookTestResult, setWebhookTestResult] = useState<WebhookTestResponse | null>(null)
  const [preview, setPreview] = useState({ country: 'US', deviceType: 'desktop', os: 'windows', language: 'en', trafficType: 'human', aiAgent: '', referrerHost: '' })
  const [previewResult, setPreviewResult] = useState<{ destination: string; fallback: boolean; matchedRule: { name: string } | null } | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  // UTM builder
  const [utmSource, setUtmSource] = useState('')
  const [utmMedium, setUtmMedium] = useState('')
  const [utmCampaign, setUtmCampaign] = useState('')

  const endpoint = useMemo(() => `/api/links/${encodeURIComponent(shortCode)}`, [shortCode])

  useEffect(() => {
    setToken(sessionStorage.getItem(`ql-token:${shortCode}`))
  }, [shortCode])

  const load = useCallback(async () => {
    const headers = { 'x-management-token': token || '' }
    try {
      const [l, r, v] = await Promise.all([
        fetch(endpoint, { headers }),
        fetch(`${endpoint}/rules`, { headers }),
        fetch(`${endpoint}/revisions`, { headers }),
      ])
      const [linkPayload, rulesData, revisionsData] = await Promise.all([
        l.json(),
        r.json(),
        v.json(),
      ])

      if (!l.ok || !r.ok || !v.ok) {
        toast.error('Could not load campaign controls')
        return
      }

      setRules(rulesData)
      setRevisions(revisionsData)
      setTags(linkPayload.tags || [])

      setOgTitle(linkPayload.title || '')
      setOgDesc(linkPayload.description || '')
      setOgImage(linkPayload.ogImage || '')

      if (linkPayload.expiresAt) {
        const date = new Date(linkPayload.expiresAt)
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
        setExpiresAt(date.toISOString().slice(0, 16))
      } else {
        setExpiresAt('')
      }
      setExpiredUrl(linkPayload.expiredUrl || '')
      setMaxClicks(linkPayload.maxClicks ? String(linkPayload.maxClicks) : '')
      setHasPassword(Boolean(linkPayload.passwordHash))

      setMetaPixelId(linkPayload.metaPixelId || '')
      setGoogleTagId(linkPayload.googleTagId || '')
      setXPixelId(linkPayload.xPixelId || '')
      setCloaked(Boolean(linkPayload.cloaked))
      setWebhookUrl(linkPayload.webhookUrl || '')

      const live = revisionsData.find((item: Revision) => new Date(item.effectiveAt).getTime() <= Date.now())
      if (live) setReleaseUrl(live.destinationUrl)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Network error loading campaign controls')
    }
  }, [endpoint, token])

  useEffect(() => {
    if (token) void load()
  }, [token, load])

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${endpoint}/${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        'Content-Type': 'application/json',
        'x-management-token': token || '',
      },
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error || 'Request failed')
    return data
  }

  async function addRule(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    setBusy(true)
    try {
      const data = await request('rules', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          priority: Number(form.priority),
          weight: Number(form.weight),
          deviceType: form.deviceType || null,
          trafficType: form.trafficType || null,
          aiAgent: form.aiAgent || null,
          os: form.os || null,
          languageCodes: form.languageCodes || null,
          startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
          endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
        }),
      })
      setRules((items) => [...items, data].sort((a, b) => a.priority - b.priority))
      setForm(emptyForm)
      toast.success('Routing rule published')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add rule')
    } finally {
      setBusy(false)
    }
  }

  async function toggleRule(rule: Rule) {
    try {
      const data = await request(`rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !rule.enabled }),
      })
      setRules((items) => items.map((item) => (item.id === rule.id ? data : item)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update rule')
    }
  }

  async function deleteRule(rule: Rule) {
    if (!window.confirm(`Delete “${rule.name}”?`)) return
    try {
      await request(`rules/${rule.id}`, { method: 'DELETE' })
      setRules((items) => items.filter((item) => item.id !== rule.id))
      toast.success('Rule deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete rule')
    }
  }

  async function updateTags(newTags: string[]) {
    try {
      await request('', { method: 'PATCH', body: JSON.stringify({ tags: newTags }) })
      setTags(newTags)
      toast.success('Tags updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update tags')
    }
  }

  async function publishRelease() {
    if (!releaseUrl.trim()) return toast.error('Enter a destination')
    try {
      const data = await request('revisions', {
        method: 'POST',
        body: JSON.stringify({ destinationUrl: releaseUrl, reason: 'Manual destination release' }),
      })
      setRevisions((items) => [data, ...items])
      toast.success('Destination published')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not publish destination')
    }
  }

  async function rollback(revision: Revision) {
    try {
      const data = await request('revisions', {
        method: 'POST',
        body: JSON.stringify({
          destinationUrl: revision.destinationUrl,
          reason: `Rollback to ${new Date(revision.effectiveAt).toLocaleString()}`,
        }),
      })
      setRevisions((items) => [data, ...items])
      setReleaseUrl(revision.destinationUrl)
      toast.success('Rollback published')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not rollback')
    }
  }

  async function saveMetadata() {
    try {
      await request('', {
        method: 'PATCH',
        body: JSON.stringify({ title: ogTitle || null, description: ogDesc || null, ogImage: ogImage || null }),
      })
      toast.success('Social metadata updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function saveExpiration() {
    try {
      await request('', {
        method: 'PATCH',
        body: JSON.stringify({
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          expiredUrl: expiredUrl || null,
          maxClicks: maxClicks ? Number(maxClicks) : null,
        }),
      })
      toast.success('Expiration settings saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function savePassword() {
    try {
      await request('', { method: 'PATCH', body: JSON.stringify({ password: password || null }) })
      toast.success(password ? 'Password protection enabled' : 'Password removed')
      setHasPassword(Boolean(password))
      setPassword('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function savePixels() {
    try {
      await request('', {
        method: 'PATCH',
        body: JSON.stringify({
          metaPixelId: metaPixelId || null,
          googleTagId: googleTagId || null,
          xPixelId: xPixelId || null,
        }),
      })
      toast.success('Tracking pixels updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function toggleCloaking(enabled: boolean) {
    try {
      await request('', { method: 'PATCH', body: JSON.stringify({ cloaked: enabled }) })
      setCloaked(enabled)
      toast.success(enabled ? 'Link cloaking enabled' : 'Link cloaking disabled')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function saveWebhook() {
    try {
      await request('', { method: 'PATCH', body: JSON.stringify({ webhookUrl: webhookUrl || null }) })
      toast.success(webhookUrl ? 'Webhook endpoint configured' : 'Webhook removed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function testWebhook() {
    if (!webhookUrl.trim()) return toast.error('Enter a webhook URL to test')
    setWebhookTestBusy(true)
    setWebhookTestResult(null)
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(shortCode)}/webhook-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-management-token': token || '',
        },
        body: JSON.stringify({ webhookUrl }),
      })
      const result = await res.json()
      setWebhookTestResult(result)
      if (res.ok && result.success) {
        toast.success(`Webhook delivered successfully (${result.latencyMs}ms, HTTP ${result.statusCode})`)
      } else {
        toast.error(`Webhook returned status ${result.statusCode || 'error'}: ${result.error || 'Failed'}`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Webhook dispatch test failed')
    } finally {
      setWebhookTestBusy(false)
    }
  }

  async function previewRouting() {
    setPreviewBusy(true)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/routing/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token || '' },
        body: JSON.stringify(preview),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Preview failed')
      setPreviewResult(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Routing preview failed')
    } finally {
      setPreviewBusy(false)
    }
  }

  function applyUtmPreset(source: string, medium: string, campaign: string) {
    setUtmSource(source)
    setUtmMedium(medium)
    setUtmCampaign(campaign)
    toast.success(`Applied ${source} preset`)
  }

  const generatedUtmUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (utmSource.trim()) params.set('utm_source', utmSource.trim())
    if (utmMedium.trim()) params.set('utm_medium', utmMedium.trim())
    if (utmCampaign.trim()) params.set('utm_campaign', utmCampaign.trim())

    const query = params.toString()
    const base = typeof window !== 'undefined' ? `${window.location.origin}/${shortCode}` : `/${shortCode}`
    return query ? `${base}?${query}` : base
  }, [shortCode, utmSource, utmMedium, utmCampaign])

  if (token === null) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">Loading…</div>
  }
  if (!token) {
    return <AccessDenied shortCode={shortCode} />
  }

  const liveRevision = nowMs === null ? undefined : revisions.find((item) => new Date(item.effectiveAt).getTime() <= nowMs)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Campaign Control Studio</span>
              <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[11px] text-blue-400">
                /{shortCode}
              </span>
            </div>
            <button
              onClick={() => {
                const url = typeof window !== 'undefined' ? `${window.location.origin}/${shortCode}` : `/${shortCode}`
                navigator.clipboard.writeText(url)
                toast.success('Short link copied')
              }}
              className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-300"
            >
              <span className="font-mono truncate max-w-xs">{typeof window !== 'undefined' ? `${window.location.origin}/${shortCode}` : `/${shortCode}`}</span>
              <Copy className="h-3 w-3" />
            </button>
          </div>

          <nav className="flex flex-wrap gap-2">
            <Link
              href={`/analytics/${shortCode}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
            >
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </Link>
            <Link
              href={`/manage/${shortCode}/qr`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
            >
              <QrCode className="h-3.5 w-3.5" /> QR Studio
            </Link>
            <Link
              href={`/manage/${shortCode}/domains`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
            >
              <Globe2 className="h-3.5 w-3.5" /> Domains
            </Link>
            <Link
              href={`/manage/${shortCode}/health`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Reliability
            </Link>
            <a
              href={`/${shortCode}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-400"
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> Test Link
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* Banner */}
        <section className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <Sparkles className="h-4 w-4" /> Link Infrastructure Operating Console
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white">Dynamic routing, releases, and audience intelligence.</h1>
          <p className="mt-2 text-sm text-slate-400">
            One permanent short code with multi-variant split tests, automated failovers, retargeting pixels, and live social card customization.
          </p>
        </section>

        {/* Primary Destination & Revision Release */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-white">Fallback Destination URL</h2>
              <p className="mt-1 text-xs text-slate-400">
                The default destination served when no smart routing rules match. Versioned with append-only revisions.
              </p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
              {liveRevision ? 'Live Release' : 'Default Destination'}
            </span>
          </div>

          <div className="mt-4 flex gap-3">
            <input
              value={releaseUrl}
              onChange={(e) => setReleaseUrl(e.target.value)}
              type="url"
              placeholder="https://example.com/campaign"
              className="input flex-1"
            />
            <button
              onClick={() => void publishRelease()}
              className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-400"
            >
              Publish Release
            </button>
          </div>

          {liveRevision && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs">
              <span className="font-mono text-slate-300 truncate mr-4">{liveRevision.destinationUrl}</span>
              <button
                onClick={() => {
                  const previous = revisions.filter((item) => item.id !== liveRevision.id)[0]
                  if (previous) void rollback(previous)
                }}
                disabled={revisions.length < 2}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500 disabled:opacity-40"
              >
                <RotateCcw className="h-3 w-3" /> Rollback
              </button>
            </div>
          )}
        </section>

        {/* Live Social Card Simulator & OpenGraph Editor */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-blue-400" />
                <h2 className="font-semibold text-lg text-white">Live Social Card Simulator & Metadata</h2>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Preview how your short link appears when shared across social networks and messaging apps.
              </p>
            </div>

            {/* Social Platform Switcher */}
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
              <button
                onClick={() => setSocialTab('twitter')}
                className={`rounded px-2.5 py-1 transition ${
                  socialTab === 'twitter' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                X (Twitter)
              </button>
              <button
                onClick={() => setSocialTab('facebook')}
                className={`rounded px-2.5 py-1 transition ${
                  socialTab === 'facebook' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Facebook
              </button>
              <button
                onClick={() => setSocialTab('linkedin')}
                className={`rounded px-2.5 py-1 transition ${
                  socialTab === 'linkedin' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                LinkedIn
              </button>
              <button
                onClick={() => setSocialTab('slack')}
                className={`rounded px-2.5 py-1 transition ${
                  socialTab === 'slack' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Slack / Discord
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Input Form */}
            <div className="space-y-4">
              <Field label="Social Card Title (OG Title)">
                <input
                  value={ogTitle}
                  onChange={(e) => setOgTitle(e.target.value)}
                  className="input"
                  placeholder="e.g. Launching QuickLink 2.0"
                />
              </Field>
              <Field label="Social Card Description (OG Description)">
                <textarea
                  value={ogDesc}
                  onChange={(e) => setOgDesc(e.target.value)}
                  rows={3}
                  className="input resize-none"
                  placeholder="e.g. High-performance smart links with real-time analytics and dynamic routing."
                />
              </Field>
              <Field label="Social Image URL (OG Image)">
                <input
                  value={ogImage}
                  onChange={(e) => setOgImage(e.target.value)}
                  type="url"
                  className="input"
                  placeholder="https://example.com/banner.png"
                />
              </Field>
              <button
                onClick={() => void saveMetadata()}
                className="w-full rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-400"
              >
                Save Social Metadata
              </button>
            </div>

            {/* Live Interactive Preview Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Live Simulator · {socialTab.toUpperCase()}
              </div>

              {socialTab === 'twitter' && (
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-black text-slate-200 shadow-md">
                  {ogImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ogImage} alt="OG Preview" className="h-44 w-full object-cover" />
                  ) : (
                    <div className="flex h-36 w-full items-center justify-center bg-slate-900 text-xs text-slate-600">
                      No Image Set
                    </div>
                  )}
                  <div className="p-3">
                    <div className="font-mono text-[11px] text-slate-500">{typeof window !== 'undefined' ? window.location.hostname : 'quicklink.to'}</div>
                    <div className="mt-0.5 font-bold text-sm text-white line-clamp-1">{ogTitle || 'Your Link Title'}</div>
                    <div className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                      {ogDesc || 'Your campaign description will be rendered here for social visitors.'}
                    </div>
                  </div>
                </div>
              )}

              {socialTab === 'facebook' && (
                <div className="overflow-hidden border border-slate-800 bg-slate-900 text-slate-200">
                  {ogImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ogImage} alt="OG Preview" className="h-44 w-full object-cover" />
                  ) : (
                    <div className="flex h-36 w-full items-center justify-center bg-slate-950 text-xs text-slate-600">
                      No Image Set
                    </div>
                  )}
                  <div className="border-t border-slate-800 bg-slate-950 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      {typeof window !== 'undefined' ? window.location.hostname : 'QUICKLINK.TO'}
                    </div>
                    <div className="font-semibold text-sm text-white line-clamp-1">{ogTitle || 'Your Link Title'}</div>
                    <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{ogDesc || 'Description snippet'}</div>
                  </div>
                </div>
              )}

              {socialTab === 'linkedin' && (
                <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900 text-slate-200">
                  {ogImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ogImage} alt="OG Preview" className="h-44 w-full object-cover" />
                  ) : (
                    <div className="flex h-36 w-full items-center justify-center bg-slate-950 text-xs text-slate-600">
                      No Image Set
                    </div>
                  )}
                  <div className="p-3 bg-slate-950">
                    <div className="font-semibold text-sm text-white line-clamp-1">{ogTitle || 'Your Link Title'}</div>
                    <div className="text-xs text-slate-500 mt-1">{typeof window !== 'undefined' ? window.location.hostname : 'quicklink.to'}</div>
                  </div>
                </div>
              )}

              {socialTab === 'slack' && (
                <div className="rounded-lg border-l-4 border-blue-500 bg-slate-900/80 p-3.5 text-xs space-y-1">
                  <div className="font-bold text-blue-400">{ogTitle || 'Your Link Title'}</div>
                  <div className="text-slate-300">{ogDesc || 'Description text inside Slack message embed.'}</div>
                  {ogImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ogImage} alt="Slack thumb" className="mt-2 h-28 rounded object-cover" />
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* UTM Campaign Studio with Presets */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-white">UTM Parameter Studio</h2>
              <p className="mt-1 text-xs text-slate-400">
                Generate tracking variants with instant presets for advertising and social campaigns.
              </p>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => applyUtmPreset('google', 'cpc', 'search_campaign')}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700"
              >
                Google Ads
              </button>
              <button
                onClick={() => applyUtmPreset('facebook', 'paid_social', 'retargeting')}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700"
              >
                Meta / FB
              </button>
              <button
                onClick={() => applyUtmPreset('twitter', 'social', 'launch_post')}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700"
              >
                X (Twitter)
              </button>
              <button
                onClick={() => applyUtmPreset('newsletter', 'email', 'weekly_roundup')}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700"
              >
                Newsletter
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Field label="Source (utm_source)">
              <input
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
                placeholder="e.g. google, twitter"
                className="input"
              />
            </Field>
            <Field label="Medium (utm_medium)">
              <input
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
                placeholder="e.g. cpc, email, social"
                className="input"
              />
            </Field>
            <Field label="Campaign (utm_campaign)">
              <input
                value={utmCampaign}
                onChange={(e) => setUtmCampaign(e.target.value)}
                placeholder="e.g. summer_promo"
                className="input"
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3.5">
            <code className="flex-1 overflow-x-auto text-xs font-mono text-blue-300 whitespace-nowrap">
              {generatedUtmUrl}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(generatedUtmUrl)
                toast.success('Campaign link copied!')
              }}
              className="shrink-0 rounded-lg bg-blue-500/10 border border-blue-500/30 px-3.5 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-500/20"
            >
              Copy Campaign URL
            </button>
          </div>
        </section>

        {/* Smart Routing Rules & A/B Experiments */}
        <section className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          {/* Add Rule Form */}
          <form onSubmit={addRule} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-400" />
              <h2 className="font-semibold text-white">Create Routing Rule / Experiment Variant</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Blank filters match all traffic. Equal priority creates deterministic A/B test splits.
            </p>

            <div className="mt-5 space-y-4">
              <Field label="Rule / Variant Name">
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder="e.g. iOS Mobile App Store or Variant B CTA"
                />
              </Field>

              <Field label="Destination URL">
                <input
                  required
                  type="url"
                  value={form.destinationUrl}
                  onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })}
                  className="input"
                  placeholder="https://example.com/ios-landing"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Priority (lower runs first)">
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Traffic Weight (for A/B split)">
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: e.target.value })}
                    className="input"
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Traffic Class">
                  <select
                    value={form.trafficType}
                    onChange={(e) => setForm({ ...form, trafficType: e.target.value })}
                    className="input"
                  >
                    <option value="">Any traffic</option>
                    <option value="human">Human visitors</option>
                    <option value="ai_agent">AI agents</option>
                    <option value="bot">Other bots</option>
                  </select>
                </Field>
                <Field label="AI Agent">
                  <select
                    value={form.aiAgent}
                    onChange={(e) => setForm({ ...form, aiAgent: e.target.value })}
                    className="input"
                  >
                    <option value="">Any AI agent</option>
                    <option value="openai">OpenAI</option>
                    <option value="openai-search">OpenAI Search</option>
                    <option value="chatgpt-user">ChatGPT user agent</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="claude-user">Claude user agent</option>
                    <option value="perplexity">Perplexity</option>
                    <option value="google-ai">Google AI</option>
                    <option value="google-gemini">Google Gemini</option>
                    <option value="amazon">Amazon</option>
                    <option value="bytedance">ByteDance</option>
                    <option value="common-crawl">Common Crawl</option>
                    <option value="cohere">Cohere</option>
                    <option value="youcom">You.com</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Operating System">
                  <select
                    value={form.os}
                    onChange={(e) => setForm({ ...form, os: e.target.value })}
                    className="input"
                  >
                    <option value="">Any OS</option>
                    <option value="ios">iOS</option>
                    <option value="android">Android</option>
                    <option value="macos">macOS</option>
                    <option value="windows">Windows</option>
                    <option value="linux">Linux</option>
                    <option value="chromeos">ChromeOS</option>
                  </select>
                </Field>
                <Field label="Languages (ISO codes)">
                  <input
                    value={form.languageCodes}
                    onChange={(e) => setForm({ ...form, languageCodes: e.target.value })}
                    className="input"
                    placeholder="en, ja, de"
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Country Codes (ISO, comma-separated)">
                  <input
                    value={form.countryCodes}
                    onChange={(e) => setForm({ ...form, countryCodes: e.target.value })}
                    className="input"
                    placeholder="US, GB, DE, CA"
                  />
                </Field>
                <Field label="Device Type Filter">
                  <select
                    value={form.deviceType}
                    onChange={(e) => setForm({ ...form, deviceType: e.target.value })}
                    className="input"
                  >
                    <option value="">Any Device</option>
                    <option value="mobile">Mobile Only</option>
                    <option value="tablet">Tablet Only</option>
                    <option value="desktop">Desktop Only</option>
                  </select>
                </Field>
              </div>

              <Field label="Referrer Domain Filter">
                <input
                  value={form.referrerDomain}
                  onChange={(e) => setForm({ ...form, referrerDomain: e.target.value })}
                  className="input"
                  placeholder="e.g. instagram.com or tiktok.com"
                />
              </Field>

              <button
                disabled={busy}
                className="w-full rounded-xl bg-blue-500 px-4 py-3 font-semibold text-white hover:bg-blue-400 disabled:opacity-60"
              >
                {busy ? 'Publishing…' : 'Publish Rule Variant'}
              </button>
            </div>
          </form>

          {/* Active Rules List */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">Active Routing Rules</h2>
                <p className="mt-1 text-xs text-slate-400">Rules evaluated in priority order.</p>
              </div>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-mono text-slate-300">
                {rules.length} Rule{rules.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {rules.length ? (
                rules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={() => void toggleRule(rule)}
                    onDelete={() => void deleteRule(rule)}
                  />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
                  No custom routing rules yet. Add one to start routing by device, country, or start an A/B experiment.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold text-white">Routing Simulator</h2>
              <p className="mt-1 text-xs text-slate-400">Test an audience before publishing a campaign. This never records a click or changes traffic.</p>
            </div>
            <span className="rounded-full bg-violet-500/10 px-3 py-1 text-[11px] font-semibold text-violet-300">SAFE PREVIEW</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <input className="input" value={preview.country} onChange={(e) => setPreview({ ...preview, country: e.target.value })} placeholder="US" aria-label="Country" />
            <select className="input" value={preview.deviceType} onChange={(e) => setPreview({ ...preview, deviceType: e.target.value })} aria-label="Device">
              <option value="desktop">Desktop</option><option value="mobile">Mobile</option><option value="tablet">Tablet</option><option value="bot">Bot</option>
            </select>
            <select className="input" value={preview.os} onChange={(e) => setPreview({ ...preview, os: e.target.value })} aria-label="Operating system">
              <option value="windows">Windows</option><option value="ios">iOS</option><option value="android">Android</option><option value="macos">macOS</option><option value="linux">Linux</option><option value="chromeos">ChromeOS</option>
            </select>
            <input className="input" value={preview.language} onChange={(e) => setPreview({ ...preview, language: e.target.value })} placeholder="en" aria-label="Language" />
            <select className="input" value={preview.trafficType} onChange={(e) => setPreview({ ...preview, trafficType: e.target.value })} aria-label="Traffic class">
              <option value="human">Human</option><option value="ai_agent">AI agent</option><option value="bot">Bot</option>
            </select>
            <input className="input" value={preview.aiAgent} onChange={(e) => setPreview({ ...preview, aiAgent: e.target.value })} placeholder="AI agent (optional)" aria-label="AI agent" />
            <button disabled={previewBusy} onClick={() => void previewRouting()} className="rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-50">
              {previewBusy ? 'Evaluating…' : 'Evaluate'}
            </button>
          </div>
          {previewResult && (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Decision</div>
                  <div className="mt-1 text-sm font-semibold text-white">{previewResult.matchedRule ? `Rule: ${previewResult.matchedRule.name}` : 'Fallback destination'}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${previewResult.fallback ? 'bg-slate-800 text-slate-400' : 'bg-emerald-500/10 text-emerald-300'}`}>
                  {previewResult.fallback ? 'NO RULE MATCH' : 'RULE MATCH'}
                </span>
              </div>
              <div className="mt-3 truncate font-mono text-xs text-blue-300">{previewResult.destination}</div>
            </div>
          )}
        </section>

        {/* Webhooks & Retargeting Pixels */}
        <section className="grid gap-8 lg:grid-cols-2">
          {/* Webhook Configuration */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-emerald-400" />
              <h2 className="font-semibold text-white">Event Webhooks</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Receive signed HMAC-SHA256 HTTP POST payloads in real-time when visitors click this link.
            </p>

            <div className="mt-5 space-y-4">
              <Field label="Webhook Endpoint URL">
                <input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  type="url"
                  placeholder="https://api.yourdomain.com/webhooks/clicks"
                  className="input"
                />
              </Field>

              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={() => void saveWebhook()}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                >
                  Save Webhook URL
                </button>
                <button
                  onClick={() => void testWebhook()}
                  disabled={webhookTestBusy || !webhookUrl}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  <Send className="h-3 w-3" />
                  {webhookTestBusy ? 'Dispatching Ping…' : 'Send Test Webhook'}
                </button>
              </div>

              {webhookTestResult && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">
                      Status: HTTP {webhookTestResult.statusCode || 'N/A'}
                    </span>
                    <span className="text-slate-500">{webhookTestResult.latencyMs}ms latency</span>
                  </div>
                  {webhookTestResult.responseBodySnippet && (
                    <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-[10px] text-slate-400">
                      {webhookTestResult.responseBodySnippet}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Retargeting Pixels & Cloaking */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="font-semibold text-white">Retargeting & Link Cloaking</h2>
            <p className="mt-1 text-xs text-slate-400">
              Fire tracking pixels before redirecting or mask destination in an iframe.
            </p>

            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Meta Pixel ID">
                  <input
                    value={metaPixelId}
                    onChange={(e) => setMetaPixelId(e.target.value)}
                    placeholder="1234567890"
                    className="input"
                  />
                </Field>
                <Field label="Google Tag ID">
                  <input
                    value={googleTagId}
                    onChange={(e) => setGoogleTagId(e.target.value)}
                    placeholder="G-XXXXXX"
                    className="input"
                  />
                </Field>
                <Field label="X Pixel ID">
                  <input
                    value={xPixelId}
                    onChange={(e) => setXPixelId(e.target.value)}
                    placeholder="abcde"
                    className="input"
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Link Cloaking (iFrame Masking)</div>
                  <div className="text-[11px] text-slate-500">Hides destination URL from visitor address bar</div>
                </div>
                <input
                  type="checkbox"
                  checked={cloaked}
                  onChange={(e) => void toggleCloaking(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-500"
                />
              </div>

              <button
                onClick={() => void savePixels()}
                className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                Save Pixel IDs
              </button>
            </div>
          </div>
        </section>

        {/* Expiration, Click Limits & Password Protection */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="font-semibold text-white">Access Protection & Expiration Controls</h2>
          <p className="mt-1 text-xs text-slate-400">
            Enforce self-destruct click limits, time-based expirations, or gate with a password.
          </p>

          <div className="mt-5 grid gap-6 md:grid-cols-2">
            {/* Expiration Controls */}
            <div className="space-y-4">
              <Field label="Expiration Date & Time">
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Max Click Limit (Self-Destruct)">
                <input
                  type="number"
                  min="1"
                  value={maxClicks}
                  onChange={(e) => setMaxClicks(e.target.value)}
                  placeholder="e.g. 500"
                  className="input"
                />
              </Field>
              <Field label="Expired Fallback Destination">
                <input
                  type="url"
                  value={expiredUrl}
                  onChange={(e) => setExpiredUrl(e.target.value)}
                  placeholder="https://example.com/expired"
                  className="input"
                />
              </Field>
              <button
                onClick={() => void saveExpiration()}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                Save Expiration Limits
              </button>
            </div>

            {/* Password Protection */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <KeyRound className="h-4 w-4 text-amber-400" />
                <span>Password Gate ({hasPassword ? 'Active' : 'Disabled'})</span>
              </div>
              <Field label="Set or Override Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={hasPassword ? '•••••••• (Leave blank to remove)' : 'Enter access password'}
                  className="input"
                />
              </Field>
              <p className="text-[11px] text-slate-500">
                Visitors must enter this password on a branded security portal before being redirected.
              </p>
              <button
                onClick={() => void savePassword()}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                Update Password Gate
              </button>
            </div>
          </div>
        </section>

        {/* Tags Organizer */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="font-semibold text-white">Campaign Tags</h2>
          <p className="mt-1 text-xs text-slate-400">Organize and filter your links across workspaces.</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300"
              >
                #{tag}
                <button
                  onClick={() => void updateTags(tags.filter((t) => t !== tag))}
                  className="hover:text-white"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (tagInput.trim() && !tags.includes(tagInput.trim().toLowerCase())) {
                void updateTags([...tags, tagInput.trim().toLowerCase()])
                setTagInput('')
              }
            }}
            className="mt-4 flex gap-3 max-w-sm"
          >
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add a tag…"
              className="input flex-1"
            />
            <button type="submit" className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700">
              Add Tag
            </button>
          </form>
        </section>

        {/* Danger Zone */}
        <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
          <div className="flex items-center gap-2 text-red-400">
            <ShieldAlert className="h-5 w-5" />
            <h2 className="font-semibold">Danger Zone</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">Destructive actions for this campaign link.</p>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-red-500/20 bg-slate-950 p-4">
            <div>
              <div className="text-sm font-medium text-slate-200">Delete Link Permanently</div>
              <div className="text-xs text-slate-500">
                Deletes this short link, routing rules, and associated analytics history.
              </div>
            </div>
            <button
              onClick={async () => {
                if (!window.confirm('Permanent action: Delete this link and all its history?')) return
                try {
                  await request('', { method: 'DELETE' })
                  toast.success('Link deleted')
                  setTimeout(() => {
                    router.push('/')
                  }, 1000)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Delete failed')
                }
              }}
              className="shrink-0 rounded-xl bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-600"
            >
              Delete Link
            </button>
          </div>
        </section>
      <RuleConflictGraph shortCode={shortCode} /></main>

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
          transition: all 0.15s ease;
        }
        .input:focus {
          border-color: rgb(96 165 250);
          box-shadow: 0 0 0 3px rgb(59 130 246 / 0.15);
        }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  )
}

function RuleCard({ rule, onToggle, onDelete }: { rule: Rule; onToggle: () => void; onDelete: () => void }) {
  const conditions = [
    rule.countryCodes ? `Geo: ${rule.countryCodes}` : null,
    rule.deviceType ? `Device: ${rule.deviceType}` : null,
    rule.trafficType ? `Traffic: ${rule.trafficType}` : null,
    rule.aiAgent ? `AI: ${rule.aiAgent}` : null,
    rule.os ? `OS: ${rule.os}` : null,
    rule.languageCodes ? `Lang: ${rule.languageCodes}` : null,
    rule.referrerDomain ? `Ref: ${rule.referrerDomain}` : null,
  ].filter(Boolean)

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
              P{rule.priority}
            </span>
            <span className="font-semibold text-sm text-slate-100">{rule.name}</span>
            <span className="font-mono text-xs text-slate-500">wt: {rule.weight}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                rule.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {rule.enabled ? 'Live' : 'Paused'}
            </span>
          </div>

          <div className="mt-2 truncate font-mono text-xs text-blue-400">{rule.destinationUrl}</div>

          {conditions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {conditions.map((cond) => (
                <span key={cond} className="rounded-full bg-slate-800/80 px-2.5 py-0.5 text-[10px] text-slate-400">
                  {cond}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={onToggle}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-700"
          >
            {rule.enabled ? 'Pause' : 'Enable'}
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
            title="Delete rule"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  )
}

function AccessDenied({ shortCode }: { shortCode: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-500" />
        <h1 className="mt-4 text-xl font-semibold">Private Campaign Controls</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Open the management URL for <span className="font-mono">/{shortCode}</span> or sign into your account to access controls.
        </p>
      </div>
    </div>
  )
}
