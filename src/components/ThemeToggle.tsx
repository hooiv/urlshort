/* eslint-disable react-hooks/set-state-in-effect -- stored theme can only be read client-side after mount. */
'use client'
import { useEffect, useState } from 'react'
import {
  THEME_STORAGE_KEY,
  readPrefersDarkSafe,
  readStoredThemeSafe,
  resolveInitialTheme,
  themeToStorage,
} from '@/components/theme-logic'

export function ThemeToggle() {
  // Start light so server and first client render match (no hydration
  // mismatch); the persisted choice is applied in the mount effect below,
  // which also fixes the old bug where a stored "dark" never got its
  // documentElement class until the next click.
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const stored = readStoredThemeSafe(() => window.localStorage.getItem(THEME_STORAGE_KEY))
    const prefersDark = readPrefersDarkSafe(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
    const initial = resolveInitialTheme(stored, prefersDark)
    setDark(initial)
    try {
      document.documentElement.classList.toggle('dark', initial)
    } catch {
      // DOM unavailable — button state alone is harmless.
    }
  }, [])
  function toggle() {
    const next = !dark
    setDark(next)
    try {
      document.documentElement.classList.toggle('dark', next)
    } catch {
      // ignore
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeToStorage(next))
    } catch {
      // Storage blocked (private mode) — theme still applies for this session.
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-100 shadow-sm hover:bg-slate-800"
    >
      {dark ? '☀ Light' : '☾ Dark'}
    </button>
  )
}
