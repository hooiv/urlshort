'use client'

import { Palette } from 'lucide-react'
import { COLOR_PRESETS, isValidHexColor, type ColorPreset } from './qrOptions'

export default function ColorControls({
  darkColor,
  lightColor,
  onDarkChange,
  onLightChange,
  onApplyPreset,
}: {
  darkColor: string
  lightColor: string
  onDarkChange: (value: string) => void
  onLightChange: (value: string) => void
  onApplyPreset: (preset: ColorPreset) => void
}) {
  const darkValid = isValidHexColor(darkColor)
  const lightValid = isValidHexColor(lightColor)
  return (
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
            onClick={() => onApplyPreset(preset)}
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
              value={darkValid ? darkColor : '#0f172a'}
              onChange={(e) => onDarkChange(e.target.value)}
              className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent"
            />
            <input
              type="text"
              value={darkColor}
              onChange={(e) => onDarkChange(e.target.value)}
              className="w-full bg-transparent font-mono text-xs text-slate-200 outline-none uppercase"
            />
          </div>
          {!darkValid && (
            <p className="mt-1 text-[11px] text-amber-400">Enter a 6-digit hex color like #0F172A.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Background (Light)</label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2">
            <input
              type="color"
              value={lightValid ? lightColor : '#ffffff'}
              onChange={(e) => onLightChange(e.target.value)}
              className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent"
            />
            <input
              type="text"
              value={lightColor}
              onChange={(e) => onLightChange(e.target.value)}
              className="w-full bg-transparent font-mono text-xs text-slate-200 outline-none uppercase"
            />
          </div>
          {!lightValid && (
            <p className="mt-1 text-[11px] text-amber-400">Enter a 6-digit hex color like #FFFFFF.</p>
          )}
        </div>
      </div>
    </section>
  )
}
