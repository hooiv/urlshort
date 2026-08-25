'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  BarChart3,
  Check,
  Copy,
  Eye,
  Link2,
  ShieldCheck,
  Sparkles,
  Zap,
  Search,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

interface ShortenedUrl {
  id: string
  originalUrl: string
  shortCode: string
  shortUrl: string
  managementUrl: string
  title?: string | null
  description?: string | null
  ogImage?: string | null
  clicks: number
  createdAt: string
}

export default function Home() {
  const [url, setUrl] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ogImage, setOgImage] = useState('')
  const [tags, setTags] = useState('')

  // Advanced toggles
  const [showUtm, setShowUtm] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showLivePreview, setShowLivePreview] = useState(false)
  const [showSecurity, setShowSecurity] = useState(false)
  const [showTracking, setShowTracking] = useState(false)
  const [showSplitTesting, setShowSplitTesting] = useState(false)

  // Security & Limits
  const [password, setPassword] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [expiredUrl, setExpiredUrl] = useState('')
  const [maxClicks, setMaxClicks] = useState('')

  // Tracking Pixels & Cloaking
  const [metaPixelId, setMetaPixelId] = useState('')
  const [googleTagId, setGoogleTagId] = useState('')
  const [xPixelId, setXPixelId] = useState('')
  const [cloaked, setCloaked] = useState(false)

  // A/B Split Testing
  const [splitRules, setSplitRules] = useState<{ id: number, url: string; weight: number }[]>([])

  // UTM builder
  const [utmSource, setUtmSource] = useState('')
  const [utmMedium, setUtmMedium] = useState('')
  const [utmCampaign, setUtmCampaign] = useState('')
  const [utmTerm, setUtmTerm] = useState('')
  const [utmContent, setUtmContent] = useState('')

  const [isLoading, setIsLoading] = useState(false)
  const [shortenedUrl, setShortenedUrl] = useState<ShortenedUrl | null>(null)

  function applyUtmPreset(source: string, medium: string, campaign: string) {
    setUtmSource(source)
    setUtmMedium(medium)
    setUtmCampaign(campaign)
    setShowUtm(true)
    toast.success(`Applied ${source} UTM preset`)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!url.trim()) return toast.error('Enter a destination URL')
    setIsLoading(true)
    try {
      let finalUrl = url.trim()
      try {
        if (finalUrl && (utmSource || utmMedium || utmCampaign || utmTerm || utmContent)) {
          const u = new URL(finalUrl.includes('://') ? finalUrl : `https://${finalUrl}`)
          if (utmSource) u.searchParams.set('utm_source', utmSource.trim())
          if (utmMedium) u.searchParams.set('utm_medium', utmMedium.trim())
          if (utmCampaign) u.searchParams.set('utm_campaign', utmCampaign.trim())
          if (utmTerm) u.searchParams.set('utm_term', utmTerm.trim())
          if (utmContent) u.searchParams.set('utm_content', utmContent.trim())
          finalUrl = u.toString()
        }
      } catch {
        // Let backend validate
      }

      const response = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: finalUrl,
          customCode: customCode.trim() || undefined,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          ogImage: ogImage.trim() || undefined,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          password: password || undefined,
          expiresAt: expiresAt || undefined,
          expiredUrl: expiredUrl.trim() || undefined,
          maxClicks: maxClicks || undefined,
          metaPixelId: metaPixelId.trim() || undefined,
          googleTagId: googleTagId.trim() || undefined,
          xPixelId: xPixelId.trim() || undefined,
          cloaked,
          splitRules: splitRules.filter(r => r.url.trim().length > 0).map(r => ({ url: r.url.trim(), weight: r.weight })),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not create link')

      setShortenedUrl(data)
      setUrl('')
      setCustomCode('')
      setTitle('')
      setDescription('')
      setOgImage('')
      setTags('')
      setPassword('')
      setExpiresAt('')
      setExpiredUrl('')
      setMaxClicks('')
      setMetaPixelId('')
      setGoogleTagId('')
      setXPixelId('')
      setCloaked(false)
      setSplitRules([])
      setUtmSource('')
      setUtmMedium('')
      setUtmCampaign('')
      setUtmTerm('')
      setUtmContent('')
      toast.success('Smart link created!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Clipboard access failed')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Toaster position="top-right" />

      {/* Navigation Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
              <Link2 className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">QuickLink</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              className="hidden md:flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              Search...
              <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500">⌘K</span>
            </button>

            <div className="h-4 w-px bg-slate-800 hidden sm:block"></div>

            <Link
              href="/bulk"
              className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white"
            >
              Bulk Import
            </Link>
            <Link
              href="/manage/bio"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Bio Pages
            </Link>
            <Link
              href="/manage/webhooks"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Webhooks
            </Link>
            <Link
              href="/account"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Account & Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="mx-auto max-w-6xl px-6 py-14 lg:py-20">
        <section className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-300">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            Campaign-Grade Link Infrastructure
          </div>
          <h1 className="mx-auto max-w-4xl text-5xl font-bold tracking-tight text-white sm:text-6xl">
            One permanent short code. <br />
            <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
              Infinite intelligent routes.
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            Route visitors dynamically by country, device OS, referrer, or time window. Run deterministic A/B split tests, track full-funnel conversions, and automate failover.
          </p>
        </section>

        {/* Shortener Card */}
        <section className="mx-auto mt-10 max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Destination URL Input */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Destination URL
              </label>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-product.com/landing-page"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-5 py-4 text-base text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                disabled={isLoading}
              />
            </div>

            {/* Custom Code & Title */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Custom Backhalf <span className="font-normal lowercase text-slate-500">(optional)</span>
                </label>
                <input
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value)}
                  placeholder="e.g. spring-sale"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-500"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Campaign Title <span className="font-normal lowercase text-slate-500">(optional)</span>
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Product Launch 2026"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-500"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Tags <span className="font-normal lowercase text-slate-500">(comma-separated)</span>
              </label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="marketing, launch, paid-ads"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-500"
                disabled={isLoading}
              />
            </div>

            {/* Quick Actions / Expanders */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowUtm(!showUtm)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    showUtm
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {showUtm ? '− Hide UTM Builder' : '+ Add UTM Parameters'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    showAdvanced
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {showAdvanced ? '− Hide Social Graph Tags' : '+ Customize Social Preview'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowSecurity(!showSecurity)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    showSecurity
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {showSecurity ? '− Hide Security & Limits' : '+ Security & Limits'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowTracking(!showTracking)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    showTracking
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {showTracking ? '− Hide Tracking Pixels' : '+ Tracking Pixels & Cloaking'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowSplitTesting(!showSplitTesting)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    showSplitTesting
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {showSplitTesting ? '− Hide A/B Testing' : '+ A/B Split Testing'}
                </button>
              </div>

              {(title || description || ogImage) && (
                <button
                  type="button"
                  onClick={() => setShowLivePreview(!showLivePreview)}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {showLivePreview ? 'Hide Preview' : 'Live Social Preview'}
                </button>
              )}
            </div>

            {/* UTM Builder Panel */}
            {showUtm && (
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-300">Campaign UTM Presets:</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyUtmPreset('google', 'cpc', 'search')}
                      className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700"
                    >
                      Google Ads
                    </button>
                    <button
                      type="button"
                      onClick={() => applyUtmPreset('facebook', 'paid_social', 'promo')}
                      className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700"
                    >
                      Meta / FB
                    </button>
                    <button
                      type="button"
                      onClick={() => applyUtmPreset('twitter', 'social', 'launch')}
                      className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700"
                    >
                      X / Twitter
                    </button>
                    <button
                      type="button"
                      onClick={() => applyUtmPreset('newsletter', 'email', 'weekly')}
                      className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700"
                    >
                      Newsletter
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value)}
                    placeholder="utm_source (e.g. google)"
                    className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                  />
                  <input
                    value={utmMedium}
                    onChange={(e) => setUtmMedium(e.target.value)}
                    placeholder="utm_medium (e.g. cpc)"
                    className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                  />
                  <input
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                    placeholder="utm_campaign (e.g. summer)"
                    className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Social Graph Tags Panel */}
            {showAdvanced && (
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Social Card Description (OG Description)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Summary shown when shared on Twitter, Facebook, LinkedIn, or Slack"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-400">Social Card Image URL (OG Image)</label>
                  <input
                    type="url"
                    value={ogImage}
                    onChange={(e) => setOgImage(e.target.value)}
                    placeholder="https://example.com/social-card.png"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Security & Limits Panel */}
            {showSecurity && (
              <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Password Protection</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Leave empty for public"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Max Clicks Limit</label>
                    <input
                      type="number"
                      value={maxClicks}
                      onChange={(e) => setMaxClicks(e.target.value)}
                      placeholder="e.g. 100"
                      min="1"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Expiration Date</label>
                    <input
                      type="datetime-local"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Expiration Redirect URL</label>
                    <input
                      type="url"
                      value={expiredUrl}
                      onChange={(e) => setExpiredUrl(e.target.value)}
                      placeholder="https://example.com/expired"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tracking Pixels Panel */}
            {showTracking && (
              <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Meta/Facebook Pixel ID</label>
                    <input
                      type="text"
                      value={metaPixelId}
                      onChange={(e) => setMetaPixelId(e.target.value)}
                      placeholder="e.g. 1234567890"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Google Tag ID</label>
                    <input
                      type="text"
                      value={googleTagId}
                      onChange={(e) => setGoogleTagId(e.target.value)}
                      placeholder="e.g. G-XXXXXXX"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">X/Twitter Pixel ID</label>
                    <input
                      type="text"
                      value={xPixelId}
                      onChange={(e) => setXPixelId(e.target.value)}
                      placeholder="e.g. n1234"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cloaked}
                        onChange={(e) => setCloaked(e.target.checked)}
                        className="rounded border-slate-800 bg-slate-950 text-blue-500 focus:ring-blue-500/50"
                      />
                      Enable Link Cloaking (iFrame)
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* A/B Split Testing Panel */}
            {showSplitTesting && (
              <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between">
                  <label className="block text-xs text-slate-400">Destination URLs (A/B Test)</label>
                  <button
                    type="button"
                    onClick={() => setSplitRules([...splitRules, { id: Date.now(), url: '', weight: 50 }])}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                  >
                    + Add Variant
                  </button>
                </div>
                <div className="space-y-3">
                  {splitRules.map((rule, idx) => (
                    <div key={rule.id} className="flex gap-3 items-center">
                      <div className="flex-1">
                        <input
                          type="url"
                          value={rule.url}
                          onChange={(e) => {
                            const newRules = [...splitRules];
                            newRules[idx].url = e.target.value;
                            setSplitRules(newRules);
                          }}
                          placeholder="https://example.com/variant-b"
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="w-24">
                        <input
                          type="number"
                          value={rule.weight}
                          onChange={(e) => {
                            const newRules = [...splitRules];
                            newRules[idx].weight = Number(e.target.value);
                            setSplitRules(newRules);
                          }}
                          placeholder="Weight %"
                          min="1"
                          max="100"
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setSplitRules(splitRules.filter(r => r.id !== rule.id))}
                        className="text-slate-500 hover:text-red-400 p-2"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {splitRules.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-2">
                      No variants added. The default destination will receive 100% of traffic.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Live Social Card Preview */}
            {showLivePreview && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Live Social Card Simulator
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-800 bg-black text-slate-200">
                  {ogImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ogImage} alt="OG Card" className="h-40 w-full object-cover" />
                  )}
                  <div className="p-3">
                    <div className="font-mono text-[10px] text-slate-500">
                      {typeof window !== 'undefined' ? window.location.hostname : 'quicklink.to'}
                    </div>
                    <div className="font-bold text-sm text-white line-clamp-1">{title || 'Campaign Title'}</div>
                    <div className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                      {description || 'Campaign description will appear here for visitors.'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 py-4 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-wait disabled:opacity-60 shadow-lg shadow-blue-500/20"
            >
              <Zap className="h-5 w-5" />
              {isLoading ? 'Allocating Infrastructure…' : 'Create Smart Link'}
            </button>
          </form>

          {/* Success Banner */}
          {shortenedUrl && (
            <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-400" />
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Smart Link Ready</p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href={shortenedUrl.shortUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-lg font-semibold text-blue-300 hover:underline truncate"
                    >
                      {shortenedUrl.shortUrl}
                    </a>
                    <button
                      onClick={() => void copyToClipboard(shortenedUrl.shortUrl)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                      title="Copy short link"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="truncate text-xs text-slate-400">{shortenedUrl.originalUrl}</p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/links/${encodeURIComponent(shortenedUrl.shortCode)}/qr?size=256`}
                    alt="QR Code"
                    width={80}
                    height={80}
                    className="rounded-xl bg-white p-1 shadow"
                  />

                  <div className="flex flex-col gap-2">
                    <a
                      href={shortenedUrl.managementUrl}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-400 shadow-sm"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Smart Routing
                    </a>
                    <Link
                      href={`/analytics/${shortenedUrl.shortCode}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
                    >
                      <BarChart3 className="h-3.5 w-3.5" /> Analytics
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Feature Grid */}
        <section className="mx-auto mt-20 grid max-w-5xl gap-6 md:grid-cols-3">
          <Feature
            icon={<Zap className="h-5 w-5 text-amber-400" />}
            title="Multi-Dimensional Routing"
            text="Route by ISO country, mobile OS (iOS/Android), referrer domain, or time window with automated health failover."
          />
          <Feature
            icon={<BarChart3 className="h-5 w-5 text-blue-400" />}
            title="Statistical A/B Testing"
            text="Run sticky deterministic weighted experiments with Bayesian probability and 95% Wilson confidence intervals."
          />
          <Feature
            icon={<ShieldCheck className="h-5 w-5 text-emerald-400" />}
            title="Private Security Console"
            text="Private token hashing, SSRF destination defense, HMAC conversion tokens, and signed real-time webhooks."
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-10 mt-16 text-xs text-slate-500">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 sm:flex-row sm:items-center sm:justify-between">
          <span>QuickLink · Enterprise smart link infrastructure</span>
          <span>Next.js 15 · PostgreSQL · TypeScript</span>
        </div>
      </footer>
    </div>
  )
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/80">
        {icon}
      </div>
      <h3 className="font-semibold text-white text-base">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{text}</p>
    </article>
  )
}
