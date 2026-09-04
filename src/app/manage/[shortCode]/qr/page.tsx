'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import ColorControls from '@/app/manage/[shortCode]/qr/components/ColorControls'
import ExportHub from '@/app/manage/[shortCode]/qr/components/ExportHub'
import FrameControls from '@/app/manage/[shortCode]/qr/components/FrameControls'
import LogoControls from '@/app/manage/[shortCode]/qr/components/LogoControls'
import PrecisionControls from '@/app/manage/[shortCode]/qr/components/PrecisionControls'
import QrHeader from '@/app/manage/[shortCode]/qr/components/QrHeader'
import QrPreview from '@/app/manage/[shortCode]/qr/components/QrPreview'
import {
  buildQrUrl,
  errorLevelForLogo,
  normalizeHexColor,
  sanitizeFrameText,
  DEFAULT_DARK_COLOR,
  DEFAULT_LIGHT_COLOR,
  type ColorPreset,
  type QrErrorLevel,
} from '@/app/manage/[shortCode]/qr/components/qrOptions'

function fallbackCopy(text: string) {
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  document.body.removeChild(area)
}

async function copyText(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
  } else {
    fallbackCopy(text)
  }
}

export default function QrStudioPage() {
  const { shortCode } = useParams<{ shortCode: string }>()

  // Customization states
  const [darkColor, setDarkColor] = useState('#0f172a')
  const [lightColor, setLightColor] = useState('#ffffff')
  const [selectedLogo, setSelectedLogo] = useState('')
  const [errorLevel, setErrorLevel] = useState<QrErrorLevel>('H')
  const [margin, setMargin] = useState(2)
  const [frameText, setFrameText] = useState('SCAN WITH CAMERA')
  const [showFrame, setShowFrame] = useState(false)
  const [downloadSize, setDownloadSize] = useState('1024')

  // Normalized for rendering: invalid typed colors fall back instead of breaking the preview.
  const previewDark = normalizeHexColor(darkColor, DEFAULT_DARK_COLOR)
  const previewLight = normalizeHexColor(lightColor, DEFAULT_LIGHT_COLOR)

  const previewUrl = useMemo(
    () =>
      buildQrUrl(shortCode, {
        format: 'svg',
        size: '600',
        margin,
        dark: darkColor,
        light: lightColor,
        level: errorLevel,
        icon: selectedLogo,
      }),
    [shortCode, margin, darkColor, lightColor, errorLevel, selectedLogo]
  )

  function getDownloadUrl(format: 'png' | 'svg', size = downloadSize) {
    return buildQrUrl(shortCode, {
      format,
      size,
      margin,
      dark: darkColor,
      light: lightColor,
      level: errorLevel,
      icon: selectedLogo,
      download: true,
    })
  }

  function applyPreset(preset: ColorPreset) {
    setDarkColor(preset.dark)
    setLightColor(preset.light)
    toast.success(`Applied ${preset.name} theme`)
  }

  async function copyEmbedUrl() {
    const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${previewUrl}` : previewUrl
    try {
      await copyText(fullUrl)
      toast.success('Direct QR image URL copied to clipboard')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Toaster position="top-right" />

      <QrHeader shortCode={shortCode} onCopyEmbedUrl={() => void copyEmbedUrl()} />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          {/* Controls Form */}
          <div className="space-y-6">
            {/* Color Palette Section */}
            <ColorControls
              darkColor={darkColor}
              lightColor={lightColor}
              onDarkChange={setDarkColor}
              onLightChange={setLightColor}
              onApplyPreset={applyPreset}
            />

            {/* Center Logo Badge Section */}
            <LogoControls
              selectedLogo={selectedLogo}
              onSelect={(id) => {
                setSelectedLogo(id)
                setErrorLevel((prev) => errorLevelForLogo(id, prev))
              }}
            />

            {/* Scan Frame Section */}
            <FrameControls
              showFrame={showFrame}
              frameText={frameText}
              onToggleShowFrame={setShowFrame}
              onFrameText={(value) => setFrameText(sanitizeFrameText(value))}
            />

            {/* Advanced Precision Section */}
            <PrecisionControls
              errorLevel={errorLevel}
              margin={margin}
              onErrorLevel={setErrorLevel}
              onMargin={setMargin}
            />
          </div>

          {/* Live High-Definition Preview & Export Box */}
          <div className="space-y-6">
            <QrPreview
              previewUrl={previewUrl}
              shortCode={shortCode}
              darkColor={previewDark}
              lightColor={previewLight}
              showFrame={showFrame}
              frameText={frameText}
            />

            {/* Export & Download Hub */}
            <ExportHub
              downloadSize={downloadSize}
              pngUrl={getDownloadUrl('png')}
              svgUrl={getDownloadUrl('svg')}
              onDownloadSize={setDownloadSize}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
