'use client'

import Link from 'next/link'

export default function QrStudioPanel({
  shortCode,
  dark,
  light,
  onDarkChange,
  onLightChange,
}: {
  shortCode: string
  dark: string
  light: string
  onDarkChange: (value: string) => void
  onLightChange: (value: string) => void
}) {
  const encoded = encodeURIComponent(shortCode)
  const previewSrc = `/api/links/${encoded}/qr?size=256&dark=${encodeURIComponent(dark)}&light=${encodeURIComponent(light)}`

  return (
    <div className="border-b border-slate-800 bg-slate-900/60 transition-all">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6 md:flex-row md:items-center">
        <div className="shrink-0 rounded-2xl border border-slate-700 bg-white p-3 shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt={`QR code for /${shortCode}`}
            width={160}
            height={160}
            className="rounded-xl object-contain"
          />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <h3 className="font-semibold text-white">Interactive QR Code Studio</h3>
            <p className="text-xs text-slate-400">
              Generate print-ready vector SVGs and high-resolution PNGs with customized color palettes.
            </p>
          </div>

          <div className="grid max-w-md grid-cols-2 gap-4">
            <label className="block text-xs">
              <span className="mb-1.5 block text-slate-400">Foreground Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={dark}
                  onChange={(e) => onDarkChange(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <input
                  type="text"
                  value={dark}
                  onChange={(e) => onDarkChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-mono text-slate-200 outline-none"
                />
              </div>
            </label>
            <label className="block text-xs">
              <span className="mb-1.5 block text-slate-400">Background Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={light}
                  onChange={(e) => onLightChange(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <input
                  type="text"
                  value={light}
                  onChange={(e) => onLightChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-mono text-slate-200 outline-none"
                />
              </div>
            </label>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <a
              href={`/api/links/${encoded}/qr?size=1024&format=png&dark=${encodeURIComponent(dark)}&light=${encodeURIComponent(light)}`}
              download={`quicklink-${shortCode}-1024.png`}
              className="rounded-lg bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-400"
            >
              Download HD PNG (1024px)
            </a>
            <a
              href={`/api/links/${encoded}/qr?size=1024&format=svg&dark=${encodeURIComponent(dark)}&light=${encodeURIComponent(light)}`}
              download={`quicklink-${shortCode}-vector.svg`}
              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Download Vector SVG
            </a>
            <Link
              href={`/manage/${shortCode}/qr`}
              className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/20"
            >
              Open Full Studio →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
