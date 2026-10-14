import { assessDestination } from '@/lib/link-safety'

/**
 * Bulk destination rewrite: migrate links when a site changes domain, moves a
 * path prefix, or switches protocol, without editing hundreds of links by hand.
 *
 * Three modes, all pure and deterministic:
 *  - host:   replace the hostname (exact, or the hostname's registrable suffix
 *            such as `old.com` matching `shop.old.com`), keeping path and query.
 *  - prefix: replace a leading path prefix (`/blog` -> `/articles`) on one host.
 *  - text:   literal find/replace over the whole URL string (no regex, so user
 *            input can never cause catastrophic backtracking).
 *
 * The result must still parse as http(s), stay under 2048 chars and clear the
 * same link-safety assessment as a freshly created link; otherwise the link is
 * reported as a failure and the whole batch is refused.
 */
export type RewriteSpec =
  | { mode: 'host'; from: string; to: string }
  | { mode: 'prefix'; host?: string; from: string; to: string }
  | { mode: 'text'; find: string; replace: string }

export type RewriteResult =
  | { changed: false }
  | { changed: true; url: string }
  | { error: string }

const MAX_URL = 2048

function normalizeHost(value: string): string | null {
  const raw = value.trim().toLowerCase().replace(/\.$/, '')
  if (!raw || /[\s/?#@:]/.test(raw)) return null
  try {
    const host = new URL(`https://${raw}`).hostname
    return host === raw || host === raw.normalize('NFC') ? host : host
  } catch { return null }
}

/** Validates a spec before touching any link. Returns an error message or null. */
export function validateRewriteSpec(spec: RewriteSpec): string | null {
  if (spec.mode === 'host') {
    if (!normalizeHost(spec.from)) return 'from must be a hostname such as old.example.com'
    if (!normalizeHost(spec.to)) return 'to must be a hostname such as new.example.com'
    return null
  }
  if (spec.mode === 'prefix') {
    if (spec.host !== undefined && !normalizeHost(spec.host)) return 'host must be a hostname'
    if (!spec.from.startsWith('/') || !spec.to.startsWith('/')) return 'Path prefixes must start with "/"'
    if (spec.from === '/') return 'Rewriting the whole path ("/") is too broad; use a longer prefix'
    return null
  }
  if (!spec.find.length) return 'find must not be empty'
  if (spec.find.length > 500 || spec.replace.length > 500) return 'find and replace are limited to 500 characters'
  return null
}

export function rewriteDestination(originalUrl: string, spec: RewriteSpec): RewriteResult {
  let next: string
  if (spec.mode === 'text') {
    if (!originalUrl.includes(spec.find)) return { changed: false }
    next = originalUrl.split(spec.find).join(spec.replace)
  } else {
    let url: URL
    try { url = new URL(originalUrl) } catch { return { error: 'Current destination could not be parsed' } }
    const host = url.hostname.toLowerCase()
    if (spec.mode === 'host') {
      const from = normalizeHost(spec.from)!
      const to = normalizeHost(spec.to)!
      if (host === from) url.hostname = to
      else if (host.endsWith(`.${from}`)) url.hostname = host.slice(0, -from.length) + to
      else return { changed: false }
    } else {
      if (spec.host && host !== normalizeHost(spec.host)) return { changed: false }
      const path = url.pathname
      const boundary = path === spec.from || path.startsWith(spec.from.endsWith('/') ? spec.from : `${spec.from}/`)
      if (!boundary) return { changed: false }
      url.pathname = spec.to + path.slice(spec.from.length)
    }
    next = url.toString()
  }
  if (next === originalUrl) return { changed: false }
  if (next.length > MAX_URL) return { error: 'Rewritten URL is longer than 2048 characters' }
  let parsed: URL
  try { parsed = new URL(next) } catch { return { error: 'Rewritten URL is not a valid URL' } }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { error: 'Rewritten URL must be http(s)' }
  const risk = assessDestination(next)
  if (risk.status === 'review') {
    // Only block when the rewrite introduced the concern; links already flagged keep working.
    const before = assessDestination(originalUrl)
    if (before.status !== 'review' || before.reason !== risk.reason) return { error: `Rewritten URL needs review: ${risk.reason}` }
  }
  return { changed: true, url: next }
}
