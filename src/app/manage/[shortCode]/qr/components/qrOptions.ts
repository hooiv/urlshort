/**
 * Pure QR studio logic: presets, input validation, and QR image URL building.
 *
 * Kept separate from React so color/size validation and URL shapes are
 * unit-testable in the node vitest environment.
 */

export interface ColorPreset {
  name: string
  dark: string
  light: string
}

export const COLOR_PRESETS: ColorPreset[] = [
  { name: 'Classic Dark', dark: '#0f172a', light: '#ffffff' },
  { name: 'Sky Electric', dark: '#0284c7', light: '#ffffff' },
  { name: 'Emerald Forest', dark: '#059669', light: '#ffffff' },
  { name: 'Indigo Night', dark: '#4f46e5', light: '#ffffff' },
  { name: 'Sunset Amber', dark: '#d97706', light: '#ffffff' },
  { name: 'Ruby Crimson', dark: '#dc2626', light: '#ffffff' },
  { name: 'Inverted Dark', dark: '#f8fafc', light: '#0f172a' },
  { name: 'Cyberpunk Neon', dark: '#06b6d4', light: '#020617' },
]

export const LOGO_OPTIONS: { id: string; label: string }[] = [
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

export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H'

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
export const FRAME_TEXT_MAX_LENGTH = 60
export const DEFAULT_DARK_COLOR = '#0f172a'
export const DEFAULT_LIGHT_COLOR = '#ffffff'
/** PNG export sizes offered in the UI (mirrors the server 128–4096 clamp). */
export const QR_DOWNLOAD_SIZES = ['512', '1024', '2048', '4096']

/** True for `#rrggbb` hex strings the QR API accepts. */
export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value.trim())
}

/** Keep a user-typed color when valid; otherwise fall back so the API never gets garbage. */
export function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = value.trim()
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : fallback
}

/** Clamp an arbitrary size string into the server-supported 128–4096 range. */
export function normalizeQrSize(size: string, fallback = '1024'): string {
  const parsed = Number.parseInt(size, 10)
  if (!Number.isFinite(parsed)) return fallback
  return String(Math.min(Math.max(parsed, 128), 4096))
}

/** The QR API supports any 0–10 margin, but the studio UI offers these presets. */
export function normalizeMargin(value: number): number {
  return value === 0 || value === 1 || value === 2 || value === 4 ? value : 2
}

/** Bound the client-only CTA frame text so it cannot bloat the DOM. */
export function sanitizeFrameText(value: string): string {
  return value.slice(0, FRAME_TEXT_MAX_LENGTH)
}

/** A center logo needs maximum redundancy to stay scannable. */
export function errorLevelForLogo(logoId: string, current: QrErrorLevel): QrErrorLevel {
  return logoId ? 'H' : current
}

export interface QrUrlOptions {
  format: 'png' | 'svg'
  size: string
  margin: number
  dark: string
  light: string
  level: QrErrorLevel
  icon: string
  download?: boolean
}

/**
 * Build the QR image URL with the same parameter shape the page always used:
 * format, size, margin, dark, light, level, then download and icon.
 * Invalid colors fall back to the defaults instead of reaching the API.
 */
export function buildQrUrl(shortCode: string, options: QrUrlOptions): string {
  const params = new URLSearchParams({
    format: options.format,
    size: normalizeQrSize(options.size),
    margin: String(normalizeMargin(options.margin)),
    dark: normalizeHexColor(options.dark, DEFAULT_DARK_COLOR),
    light: normalizeHexColor(options.light, DEFAULT_LIGHT_COLOR),
    level: options.level,
  })
  if (options.download) params.set('download', '1')
  if (options.icon) params.set('icon', options.icon)
  return `/api/links/${encodeURIComponent(shortCode)}/qr?${params.toString()}`
}
