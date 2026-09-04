'use client'

export default function QrPreview({
  previewUrl,
  shortCode,
  darkColor,
  lightColor,
  showFrame,
  frameText,
}: {
  previewUrl: string
  shortCode: string
  darkColor: string
  lightColor: string
  showFrame: boolean
  frameText: string
}) {
  return (
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
  )
}
