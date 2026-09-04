export interface DeepLinkResolvePayload {
  action?: string
  url?: string
  webUrl?: string
  storeUrl?: string
}

export interface DeepLinkFallback {
  openHref: string
  storeHref: string
  webHref: string
}

/** Resolver endpoint for a short code. The code is path-encoded. */
export function buildDeepLinkResolverUrl(shortCode: string): string {
  return `/api/deep-links/resolve/${encodeURIComponent(shortCode)}`
}

/**
 * Only allow navigation to http(s), app links, or custom app schemes.
 * The resolver response is server-controlled data rendered into hrefs, so
 * javascript:/data: payloads must never reach window.location or anchors.
 */
export function isSafeDeepLinkTarget(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed === '/') return true
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//')
  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('blob:')
  ) {
    return false
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return true
    // Custom app schemes (myapp://) carry no host allowlist client-side;
    // require a non-empty scheme and path/host to block bare "scheme:" tricks.
    return /^[a-z][a-z0-9+.-]*:$/.test(parsed.protocol) && trimmed.length > parsed.protocol.length + 2
  } catch {
    return false
  }
}

function firstSafeUrl(...candidates: Array<unknown>): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && isSafeDeepLinkTarget(candidate)) {
      return candidate
    }
  }
  return '/'
}

export function pickDeepLinkFallback(payload: DeepLinkResolvePayload): DeepLinkFallback {
  return {
    openHref: firstSafeUrl(payload.url, payload.webUrl),
    storeHref: firstSafeUrl(payload.storeUrl, payload.webUrl),
    webHref: firstSafeUrl(payload.webUrl),
  }
}

/** Auto-open only when the resolver explicitly says so with a safe native target. */
export function shouldAutoOpenNative(payload: DeepLinkResolvePayload): boolean {
  return payload.action === 'open' && typeof payload.url === 'string' && isSafeDeepLinkTarget(payload.url)
}
