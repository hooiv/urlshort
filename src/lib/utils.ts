import { nanoid } from 'nanoid'

export function generateShortCode(length: number = 7): string { return nanoid(length) }

/**
 * Short codes that would shadow application routes or confuse users.
 * Custom codes matching these are rejected at creation; generated codes are
 * excluded from collision retries.
 */
const RESERVED_CODES = new Set([
  // App pages
  'account', 'admin', 'analytics', 'api', 'api-docs', 'blocked', 'expired',
  'login', 'logout', 'manage', 'register', 'reset-password', 'signin',
  'signup', 'verify-email', 'workspaces',
  // Status/infra conventions
  '404', '500', '503', 'health', 'status', 'favicon', 'robots', 'sitemap',
  'docs', 'help', 'support', 'blog', 'about', 'pricing', 'terms', 'privacy',
])

export function isReservedCode(code: string): boolean {
  return RESERVED_CODES.has(code.toLowerCase())
}

export function isValidUrl(url: string): boolean { try { const urlObj = new URL(url); return urlObj.protocol === 'http:' || urlObj.protocol === 'https:' } catch { return false } }
export function normalizeUrl(url: string): string { const value = url.trim(); return /^https?:\/\//i.test(value) ? value : `https://${value}` }
export function getBaseUrl(): string { return (process.env.NEXT_PUBLIC_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://yourapp.com' : 'http://localhost:3000')).replace(/\/$/, '') }
export function getShortUrl(shortCode: string): string { return `${getBaseUrl()}/${shortCode}` }
