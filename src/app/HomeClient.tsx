'use client'

import { useState } from 'react'
import { Eye, Zap } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { useCreateShortLink } from '@/app/components/useCreateShortLink'
import SiteHeader from '@/app/components/SiteHeader'
import HeroSection from '@/app/components/HeroSection'
import FeatureGrid from '@/app/components/FeatureGrid'
import UtmBuilder from '@/app/components/UtmBuilder'
import { SecurityLimitsPanel, SocialGraphPanel, TrackingPixelsPanel } from '@/app/components/OptionPanels'
import SplitTestingPanel from '@/app/components/SplitTestingPanel'
import SocialPreview from '@/app/components/SocialPreview'
import ShortenResult from '@/app/components/ShortenResult'

export default function Home() {
  const {
    form,
    patch,
    isLoading,
    shortenedUrl,
    submit,
    applyUtmPreset,
    addSplitVariant,
    updateSplitVariant,
    removeSplitVariant,
    copyToClipboard,
  } = useCreateShortLink()

  const [showUtm, setShowUtm] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showLivePreview, setShowLivePreview] = useState(false)
  const [showSecurity, setShowSecurity] = useState(false)
  const [showTracking, setShowTracking] = useState(false)
  const [showSplitTesting, setShowSplitTesting] = useState(false)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Toaster position="top-right" />
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 py-14 lg:py-20">
        <HeroSection />

        <section className="mx-auto mt-10 max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-8">
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Destination URL
              </label>
              <input
                type="url"
                required
                value={form.url}
                onChange={(e) => patch({ url: e.target.value })}
                placeholder="https://your-product.com/landing-page"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-5 py-4 text-base text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Custom Backhalf <span className="font-normal lowercase text-slate-500">(optional)</span>
                </label>
                <input
                  value={form.customCode}
                  onChange={(e) => patch({ customCode: e.target.value })}
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
                  value={form.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="e.g. Product Launch 2026"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-500"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Tags <span className="font-normal lowercase text-slate-500">(comma-separated)</span>
              </label>
              <input
                value={form.tags}
                onChange={(e) => patch({ tags: e.target.value })}
                placeholder="marketing, launch, paid-ads"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-500"
                disabled={isLoading}
              />
            </div>

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

              {(form.title || form.description || form.ogImage) && (
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

            {showUtm && (
              <UtmBuilder
                form={form}
                disabled={isLoading}
                onChange={patch}
                onPreset={(source, medium, campaign) => {
                  applyUtmPreset(source, medium, campaign)
                  setShowUtm(true)
                  toast.success(`Applied ${source} UTM preset`)
                }}
              />
            )}

            {showAdvanced && <SocialGraphPanel form={form} onChange={patch} disabled={isLoading} />}

            {showSecurity && <SecurityLimitsPanel form={form} onChange={patch} disabled={isLoading} />}

            {showTracking && <TrackingPixelsPanel form={form} onChange={patch} disabled={isLoading} />}

            {showSplitTesting && (
              <SplitTestingPanel
                rules={form.splitRules}
                disabled={isLoading}
                onAdd={addSplitVariant}
                onUpdate={updateSplitVariant}
                onRemove={removeSplitVariant}
              />
            )}

            {showLivePreview && (
              <SocialPreview title={form.title} description={form.description} ogImage={form.ogImage} />
            )}

            <button
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 py-4 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-wait disabled:opacity-60 shadow-lg shadow-blue-500/20"
            >
              <Zap className="h-5 w-5" />
              {isLoading ? 'Allocating Infrastructure…' : 'Create Smart Link'}
            </button>
          </form>

          {shortenedUrl && <ShortenResult result={shortenedUrl} onCopy={copyToClipboard} />}
        </section>

        <FeatureGrid />
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 py-10 mt-16 text-xs text-slate-500">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 sm:flex-row sm:items-center sm:justify-between">
          <span>QuickLink · Enterprise smart link infrastructure</span>
          <span>Next.js 15 · PostgreSQL · TypeScript</span>
        </div>
      </footer>
    </div>
  )
}
