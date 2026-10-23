import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export type HealthProbe = {
  status: 'healthy' | 'degraded' | 'down'
  statusCode: number | null
  latencyMs: number | null
  error: string | null
  finalUrl: string
}

const MAX_REDIRECTS = 5
const TIMEOUT_MS = 5000

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b, c] = parts
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224
  )
}

/** Expand an IPv6 literal to 8 hextets; null when malformed. */
function expandIPv6(ip: string): number[] | null {
  let text = ip
  const v4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const o = v4[1].split('.').map(Number)
    if (o.some((n) => n > 255)) return null
    text = text.slice(0, -v4[1].length) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16)
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  const nums = all.map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN))
  return nums.length === 8 && nums.every((n) => !Number.isNaN(n)) ? nums : null
}

export function isPrivateIPv6(input: string): boolean {
  const h = expandIPv6(input.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0])
  if (!h) return true
  const embedded = (hi: number, lo: number) => isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
  if (h.slice(0, 5).every((n) => n === 0) && (h[5] === 0xffff || h[5] === 0)) return h.slice(5, 8).every((n) => n === 0) && h[5] === 0 ? true : embedded(h[6], h[7]) // ::, ::1, mapped, compat
  if (h[0] === 0x64 && h[1] === 0xff9b) return embedded(h[6], h[7]) // NAT64
  if (h[0] === 0x2002) return embedded(h[1], h[2]) // 6to4
  if ((h[0] & 0xfe00) === 0xfc00) return true // ULA
  if ((h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0) return true // link-local / site-local
  if ((h[0] & 0xff00) === 0xff00) return true // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true // documentation
  return false
}

/**
 * Validate that a destination URL is publicly routable before storing it.
 * Blocks localhost, private ranges, link-local (incl. cloud metadata
 * 169.254.169.254), and credential-bearing URLs at link-creation time —
 * not just at probe time.
 */
export async function assertDestinationSafeForStorage(input: string): Promise<void> {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS destinations are allowed')
  if (url.username || url.password) throw new Error('Credential-bearing destinations are not allowed')
  await assertPublicHost(url)
}

export async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('Private/local destinations are not allowed')
  if (isIP(host)) {
    const blocked = isIP(host) === 4 ? isPrivateIPv4(host) : isPrivateIPv6(host)
    if (blocked) throw new Error('Private IP destinations are not allowed')
    return
  }
  const results = await lookup(host, { all: true, verbatim: true })
  if (!results.length) throw new Error('Destination did not resolve')
  for (const result of results) {
    const blocked = result.family === 4 ? isPrivateIPv4(result.address) : isPrivateIPv6(result.address)
    if (blocked) throw new Error('Destination resolves to a private IP address')
  }
}

export async function normalizeHealthTarget(input: string): Promise<string> {
  const url = new URL(input.trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS destinations can be monitored')
  if (url.username || url.password) throw new Error('Credential-bearing destinations are not allowed')
  await assertPublicHost(url)
  return url.toString()
}

async function requestProbe(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: controller.signal, headers: { 'user-agent': 'QuickLink-Health/1.0' } })
  } finally {
    clearTimeout(timeout)
  }
}

async function requestGetFallback(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { method: 'GET', redirect: 'manual', cache: 'no-store', signal: controller.signal, headers: { range: 'bytes=0-0', 'user-agent': 'QuickLink-Health/1.0' } })
  } finally {
    clearTimeout(timeout)
  }
}

export async function probeDestination(input: string): Promise<HealthProbe> {
  const started = Date.now()
  let current = await normalizeHealthTarget(input)
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      await assertPublicHost(new URL(current))
      let response = await requestProbe(current)
      if (response.status === 405 || response.status === 501) response = await requestGetFallback(current)
      const latencyMs = Date.now() - started
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) return { status: 'down', statusCode: response.status, latencyMs, error: 'Redirect response has no Location header', finalUrl: current }
        if (redirects === MAX_REDIRECTS) return { status: 'down', statusCode: response.status, latencyMs, error: 'Too many redirects', finalUrl: current }
        current = new URL(location, current).toString()
        continue
      }
      const status = response.status >= 200 && response.status < 400 ? (latencyMs > 2000 ? 'degraded' : 'healthy') : 'down'
      return { status, statusCode: response.status, latencyMs, error: status === 'down' ? `HTTP ${response.status}` : null, finalUrl: current }
    }
    return { status: 'down', statusCode: null, latencyMs: Date.now() - started, error: 'Health probe failed', finalUrl: current }
  } catch (error) {
    return { status: 'down', statusCode: null, latencyMs: Date.now() - started, error: error instanceof Error ? error.message.slice(0, 500) : 'Health probe failed', finalUrl: current }
  }
}
