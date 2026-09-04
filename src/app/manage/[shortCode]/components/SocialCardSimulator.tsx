'use client'

import { Share2 } from 'lucide-react'
import Field from '@/app/manage/[shortCode]/components/Field'
import { isHttpUrl } from '@/app/manage/[shortCode]/components/campaign-utils'
import type { SocialPlatform } from '@/app/manage/[shortCode]/components/campaign-types'

interface SocialCardSimulatorProps {
  ogTitle: string
  ogDesc: string
  ogImage: string
  onOgTitleChange: (value: string) => void
  onOgDescChange: (value: string) => void
  onOgImageChange: (value: string) => void
  socialTab: SocialPlatform
  onSocialTabChange: (tab: SocialPlatform) => void
  onSave: () => void
}

const tabs: Array<{ id: SocialPlatform; label: string }> = [
  { id: 'twitter', label: 'X (Twitter)' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'slack', label: 'Slack / Discord' },
]

export default function SocialCardSimulator({
  ogTitle,
  ogDesc,
  ogImage,
  onOgTitleChange,
  onOgDescChange,
  onOgImageChange,
  socialTab,
  onSocialTabChange,
  onSave,
}: SocialCardSimulatorProps) {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'quicklink.to'
  // Never render an arbitrary-scheme string as an image source; fall back to the placeholder.
  const previewImage = isHttpUrl(ogImage) ? ogImage : null

  return (
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
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onSocialTabChange(tab.id)}
              className={`rounded px-2.5 py-1 transition ${
                socialTab === tab.id ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Input Form */}
        <div className="space-y-4">
          <Field label="Social Card Title (OG Title)">
            <input
              value={ogTitle}
              onChange={(e) => onOgTitleChange(e.target.value)}
              className="input"
              placeholder="e.g. Launching QuickLink 2.0"
            />
          </Field>
          <Field label="Social Card Description (OG Description)">
            <textarea
              value={ogDesc}
              onChange={(e) => onOgDescChange(e.target.value)}
              rows={3}
              className="input resize-none"
              placeholder="e.g. High-performance smart links with real-time analytics and dynamic routing."
            />
          </Field>
          <Field label="Social Image URL (OG Image)">
            <input
              value={ogImage}
              onChange={(e) => onOgImageChange(e.target.value)}
              type="url"
              className="input"
              placeholder="https://example.com/banner.png"
            />
          </Field>
          <button
            onClick={onSave}
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
              {previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt="OG Preview" className="h-44 w-full object-cover" />
              ) : (
                <div className="flex h-36 w-full items-center justify-center bg-slate-900 text-xs text-slate-600">
                  No Image Set
                </div>
              )}
              <div className="p-3">
                <div className="font-mono text-[11px] text-slate-500">{hostname}</div>
                <div className="mt-0.5 font-bold text-sm text-white line-clamp-1">{ogTitle || 'Your Link Title'}</div>
                <div className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                  {ogDesc || 'Your campaign description will be rendered here for social visitors.'}
                </div>
              </div>
            </div>
          )}

          {socialTab === 'facebook' && (
            <div className="overflow-hidden border border-slate-800 bg-slate-900 text-slate-200">
              {previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt="OG Preview" className="h-44 w-full object-cover" />
              ) : (
                <div className="flex h-36 w-full items-center justify-center bg-slate-950 text-xs text-slate-600">
                  No Image Set
                </div>
              )}
              <div className="border-t border-slate-800 bg-slate-950 p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  {hostname}
                </div>
                <div className="font-semibold text-sm text-white line-clamp-1">{ogTitle || 'Your Link Title'}</div>
                <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{ogDesc || 'Description snippet'}</div>
              </div>
            </div>
          )}

          {socialTab === 'linkedin' && (
            <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900 text-slate-200">
              {previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt="OG Preview" className="h-44 w-full object-cover" />
              ) : (
                <div className="flex h-36 w-full items-center justify-center bg-slate-950 text-xs text-slate-600">
                  No Image Set
                </div>
              )}
              <div className="p-3 bg-slate-950">
                <div className="font-semibold text-sm text-white line-clamp-1">{ogTitle || 'Your Link Title'}</div>
                <div className="text-xs text-slate-500 mt-1">{hostname}</div>
              </div>
            </div>
          )}

          {socialTab === 'slack' && (
            <div className="rounded-lg border-l-4 border-blue-500 bg-slate-900/80 p-3.5 text-xs space-y-1">
              <div className="font-bold text-blue-400">{ogTitle || 'Your Link Title'}</div>
              <div className="text-slate-300">{ogDesc || 'Description text inside Slack message embed.'}</div>
              {previewImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt="Slack thumb" className="mt-2 h-28 rounded object-cover" />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
