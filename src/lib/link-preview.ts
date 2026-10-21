import { assessDestination } from './link-safety'
import { linkWindowState, type LinkWindowState } from './link-schedule'

/**
 * Public "where does this short link go?" summary (the Bitly `+` / Dub preview idea).
 * Visiting it never counts a click. The full destination is only revealed when the
 * owner has not hidden it: password-protected and cloaked links show the host at most
 * never the path/query, and links the owner made private reveal nothing.
 */
export type PreviewLink = {
  shortCode: string
  originalUrl: string
  title: string | null
  description: string | null
  isActive: boolean
  deletedAt: Date | null
  startsAt: Date | null
  expiresAt: Date | null
  maxClicks: number | null
  clicks: number
  passwordHash: string | null
  cloaked: boolean
}

export type LinkPreview = {
  shortCode: string
  status: 'live' | 'scheduled' | 'expired' | 'disabled' | 'limit_reached'
  title: string | null
  description: string | null
  protectedByPassword: boolean
  /** Hostname only (punycode as stored), or null when nothing may be shown. */
  host: string | null
  /** Full destination, only for links that are not password-protected or cloaked. */
  destination: string | null
  secure: boolean | null
  safety: { status: 'cleared' | 'review'; reason: string | null } | null
}

export function buildLinkPreview(link: PreviewLink, now: Date = new Date()): LinkPreview | null {
  if (link.deletedAt) return null
  let url: URL | null = null
  try { url = new URL(link.originalUrl) } catch { url = null }
  const hidden = !!link.passwordHash || link.cloaked
  const window: LinkWindowState = linkWindowState(link, now)
  let status: LinkPreview['status'] = 'live'
  if (!link.isActive) status = 'disabled'
  else if (window === 'scheduled') status = 'scheduled'
  else if (window === 'expired') status = 'expired'
  else if (link.maxClicks != null && link.clicks >= link.maxClicks) status = 'limit_reached'

  const http = url && (url.protocol === 'http:' || url.protocol === 'https:')
  return {
    shortCode: link.shortCode,
    status,
    title: hidden ? null : link.title,
    description: hidden ? null : link.description,
    protectedByPassword: !!link.passwordHash,
    host: url && http && !link.passwordHash ? url.hostname : null,
    destination: url && http && !hidden ? link.originalUrl : null,
    secure: url && http ? url.protocol === 'https:' : null,
    safety: url ? assessDestination(link.originalUrl) : null,
  }
}
