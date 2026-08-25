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

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true
  const [a, b] = parts
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a >= 224)
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  // Handle IPv4-mapped IPv6 (e.g. ::ffff:10.0.0.1) by checking the embedded v4.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')
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

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase()
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
