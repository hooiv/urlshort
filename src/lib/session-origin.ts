import { isIP } from 'node:net'

export type SessionOrigin = { ipPrefix: string | null; country: string | null }

/**
 * Coarsens a client IP so we can show "where" a session signed in without
 * storing a full address: IPv4 keeps /24, IPv6 keeps /48.
 */
export function coarsenIp(raw: string | null | undefined): string | null {
  const ip = (raw ?? '').trim()
  const kind = isIP(ip)
  if (kind === 4) {
    const [a, b, c] = ip.split('.')
    return `${a}.${b}.${c}.0/24`
  }
  if (kind === 6) {
    if (ip.includes('.')) return null // IPv4-mapped forms: skip rather than guess
    const [head, tail] = ip.split('::')
    const groups = head ? head.split(':') : []
    const expanded = tail === undefined ? groups : [...groups, ...Array(Math.max(0, 8 - groups.length - (tail ? tail.split(':').length : 0))).fill('0'), ...(tail ? tail.split(':') : [])]
    const first = expanded.slice(0, 3).map((g) => (g || '0').toLowerCase().replace(/^0+(?=.)/, ''))
    if (first.length < 3) return null
    return `${first.join(':')}::/48`
  }
  return null
}

/** Reads coarse origin from proxy headers; country only when a CDN supplies a valid ISO code. */
export function sessionOriginFromHeaders(headers: Headers): SessionOrigin {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip')
  const c = (headers.get('x-vercel-ip-country') || headers.get('cf-ipcountry') || '').toUpperCase()
  return { ipPrefix: coarsenIp(forwarded), country: /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : null }
}
