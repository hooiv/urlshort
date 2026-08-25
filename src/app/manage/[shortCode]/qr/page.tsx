'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Palette,
  Sparkles,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

interface ColorPreset {
  name: string
  dark: string
  light: string
}

const COLOR_PRESETS: ColorPreset[] = [
  { name: 'Classic Dark', dark: '#0f172a', light: '#ffffff' },
  { name: 'Sky Electric', dark: '#0284c7', light: '#ffffff' },
  { name: 'Emerald Forest', dark: '#059669', light: '#ffffff' },
  { name: 'Indigo Night', dark: '#4f46e5', light: '#ffffff' },
  { name: 'Sunset Amber', dark: '#d97706', light: '#ffffff' },
  { name: 'Ruby Crimson', dark: '#dc2626', light: '#ffffff' },
  { name: 'Inverted Dark', dark: '#f8fafc', light: '#0f172a' },
  { name: 'Cyberpunk Neon', dark: '#06b6d4', light: '#020617' },
]

const LOGO_OPTIONS = [
  { id: '', label: 'None' },
  { id: 'link', label: 'Link' },
  { id: 'twitter', label: 'X / Twitter' },
  { id: 'github', label: 'GitHub' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'cart', label: 'Store Cart' },
  { id: 'globe', label: 'Globe' },
  { id: 'zap', label: 'Lightning' },
]

export default function QrStudioPage() {
  const { shortCode } = useParams<{ shortCode: string }>()

  // Customization states
  const [darkColor, setDarkColor] = useState('#0f172a')
  const [lightColor, setLightColor] = useState('#ffffff')
  const [selectedLogo, setSelectedLogo] = useState('')
  const [errorLevel, setErrorLevel] = useState<'L' | 'M' | 'Q' | 'H'>('H')
  const [margin, setMargin] = useState(2)
  const [frameText, setFrameText] = useState('SCAN WITH CAMERA')
  const [showFrame, setShowFrame] = useState(false)
  const [downloadSize, setDownloadSize] = useState('1024')

  const previewUrl = useMemo(() => {
    const params = new URLSearchParams({
      format: 'svg',
      size: '600',
      margin: String(margin),
      dark: darkColor,
      light: lightColor,
      level: errorLevel,
    })
    if (selectedLogo) params.set('icon', selectedLogo)
    return `/api/links/${encodeURIComponent(shortCode)}/qr?${params.toString()}`
  }, [shortCode, margin, darkColor, lightColor, errorLevel, selectedLogo])

  function getDownloadUrl(format: 'png' | 'svg', size = downloadSize) {
    const params = new URLSearchParams({
      format,
      size,
      margin: String(margin),
      dark: darkColor,
      light: lightColor,
      level: errorLevel,
      download: '1',
    })
    if (selectedLogo) params.set('icon', selectedLogo)
    return `/api/links/${encodeURIComponent(shortCode)}/qr?${params.toString()}`
  }

  function applyPreset(preset: ColorPreset) {
    setDarkColor(preset.dark)
    setLightColor(preset.light)
    toast.success(`Applied ${preset.name} theme`)
  }

  function copyEmbedUrl() {
    const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${previewUrl}` : previewUrl
    void navigator.clipboard.writeText(fullUrl)
    toast.success('Direct QR image URL copied to clipboard')
  }

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
                <span className="font-semibold text-white">Enterprise QR Code Studio</span>
                <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[11px] text-blue-400">
                  /{shortCode}
                </span>
              </div>
              <p className="text-xs text-slate-500">Vector-ready custom QR codes for print, packaging, and digital media</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyEmbedUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
            >
              <Copy className="h-3.5 w-3.5" /> Copy Image URL
            </button>
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

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          {/* Controls Form */}
          <div className="space-y-6">
            {/* Color Palette Section */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <div className="flex items-center gap-2 text-white font-semibold mb-2">
                <Palette className="h-4 w-4 text-blue-400" />
                <span>Color Themes & Palette</span>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Choose a pre-tested high contrast preset or pick custom brand hex colors.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-left text-xs hover:border-slate-700 transition"
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-slate-700 shrink-0"
                      style={{ backgroundColor: preset.dark }}
                    />
                    <span className="truncate text-slate-300 font-medium">{preset.name}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Pattern Color (Dark)</label>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2">
                    <input
                      type="color"
                      value={darkColor}
                      onChange={(e) => setDarkColor(e.target.value)}
                      className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent"
                    />
                    <input
                      type="text"
                      value={darkColor}
                      onChange={(e) => setDarkColor(e.target.value)}
                      className="w-full bg-transparent font-mono text-xs text-slate-200 outline-none uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Background (Light)</label>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2">
                    <input
                      type="color"
                      value={lightColor}
                      onChange={(e) => setLightColor(e.target.value)}
                      className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent"
                    />
                    <input
                      type="text"
                      value={lightColor}
                      onChange={(e) => setLightColor(e.target.value)}
                      className="w-full bg-transparent font-mono text-xs text-slate-200 outline-none uppercase"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Center Logo Badge Section */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <div className="flex items-center gap-2 text-white font-semibold mb-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <span>Center Logo Badge</span>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Embed a brand icon in the center of the QR matrix with high error correction.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {LOGO_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setSelectedLogo(opt.id)
                      if (opt.id) setErrorLevel('H')
                    }}
                    className={`rounded-xl border p-2.5 text-center text-xs font-medium transition ${
                      selectedLogo === opt.id
                        ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Scan Frame Section */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Layers className="h-4 w-4 text-emerald-400" />
                  <span>Call-to-Action Frame</span>
                </div>
                <input
                  type="checkbox"
                  checked={showFrame}
                  onChange={(e) => setShowFrame(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-500"
                />
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Surround the QR code with an eye-catching CTA frame for physical flyers or social banners.
              </p>

              {showFrame && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Frame Text</label>
                  <input
                    type="text"
                    value={frameText}
                    onChange={(e) => setFrameText(e.target.value)}
                    placeholder="SCAN WITH CAMERA"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-100 outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </section>

            {/* Advanced Precision Section */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h3 className="font-semibold text-white text-sm mb-3">Precision & Redundancy</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Error Correction Level</label>
                  <select
                    value={errorLevel}
                    onChange={(e) => setErrorLevel(e.target.value as 'L' | 'M' | 'Q' | 'H')}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                  >
                    <option value="L">Low (7% recovery)</option>
                    <option value="M">Medium (15% recovery)</option>
                    <option value="Q">Quartile (25% recovery)</option>
                    <option value="H">High (30% recovery - Recommended)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Quiet Zone Margin</label>
                  <select
                    value={margin}
                    onChange={(e) => setMargin(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                  >
                    <option value={0}>0 Modules (Border flush)</option>
                    <option value={1}>1 Module</option>
                    <option value={2}>2 Modules (Standard)</option>
                    <option value={4}>4 Modules (ISO Standard)</option>
                  </select>
                </div>
              </div>
            </section>
          </div>

          {/* Live High-Definition Preview & Export Box */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-6">
                Interactive Live Vector Canvas
              </div>

              {/* QR Canvas Render */}
              <div
                className={`overflow-hidden rounded-3xl transition-all shadow-xl flex flex-col items-center ${
                  showFrame ? 'p-6 pb-5' : 'p-6'
                }`}
                style={{ backgroundColor: lightColor, color: darkColor }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Dynamic QR Code"
                  className="w-64 h-64 sm:w-72 sm:h-72 object-contain"
                />

                {showFrame && (
                  <div
                    className="mt-4 rounded-xl px-5 py-2 font-bold text-xs uppercase tracking-wider shadow-sm text-center"
                    style={{ backgroundColor: darkColor, color: lightColor }}
                  >
                    {frameText || 'SCAN WITH CAMERA'}
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center gap-2 text-xs font-mono text-slate-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>/{shortCode} · Vector SVG Ready</span>
              </div>
            </div>

            {/* Export & Download Hub */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
              <h3 className="font-semibold text-white text-sm">Download High-Resolution Asset</h3>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">PNG Resolution</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '512px', val: '512' },
                    { label: '1024px', val: '1024' },
                    { label: '2048px (2K)', val: '2048' },
                    { label: '4096px (4K)', val: '4096' },
                  ].map((res) => (
                    <button
                      key={res.val}
                      onClick={() => setDownloadSize(res.val)}
                      className={`rounded-xl border py-2 text-xs font-mono font-medium transition ${
                        downloadSize === res.val
                          ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      {res.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <a
                  href={getDownloadUrl('png')}
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-400 transition"
                >
                  <Download className="h-4 w-4" /> Download PNG ({downloadSize}px)
                </a>

                <a
                  href={getDownloadUrl('svg')}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white transition"
                >
                  <Download className="h-4 w-4" /> Download Vector SVG
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
