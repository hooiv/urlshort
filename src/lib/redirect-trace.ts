import { assertPublicHost, normalizeHealthTarget } from '@/lib/destination-health'

export type TraceHop = { url: string; status: number | null; location: string | null; latencyMs: number; error: string | null }
export type TraceResult = {
  hops: TraceHop[]
  finalUrl: string
  totalMs: number
  loop: boolean
  truncated: boolean
  insecureDowngrade: boolean
}

export type TraceDeps = {
  fetchHop: (url: string) => Promise<{ status: number; location: string | null }>
  assertPublic: (url: URL) => Promise<void>
  now: () => number
}

export const MAX_TRACE_HOPS = 10

async function defaultFetchHop(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: controller.signal, headers: { 'user-agent': 'QuickLink-Trace/1.0' } })
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'manual', cache: 'no-store', signal: controller.signal, headers: { range: 'bytes=0-0', 'user-agent': 'QuickLink-Trace/1.0' } })
    }
    return { status: res.status, location: res.headers.get('location') }
  } finally {
    clearTimeout(timer)
  }
}

const defaultDeps: TraceDeps = { fetchHop: defaultFetchHop, assertPublic: assertPublicHost, now: Date.now }

/** Follows redirects manually, re-validating every hop against private ranges (SSRF-safe). */
export async function traceRedirects(input: string, deps: TraceDeps = defaultDeps, maxHops = MAX_TRACE_HOPS): Promise<TraceResult> {
  const startUrl = deps === defaultDeps ? await normalizeHealthTarget(input) : new URL(input).toString()
  const started = deps.now()
  const hops: TraceHop[] = []
  const seen = new Set<string>()
  let current = startUrl
  let loop = false
  let truncated = false
  let insecureDowngrade = false

  for (let i = 0; i < maxHops; i += 1) {
    if (seen.has(current)) { loop = true; break }
    seen.add(current)
    const t0 = deps.now()
    try {
      await deps.assertPublic(new URL(current))
      const res = await deps.fetchHop(current)
      const hop: TraceHop = { url: current, status: res.status, location: res.location, latencyMs: deps.now() - t0, error: null }
      hops.push(hop)
      if (res.status >= 300 && res.status < 400 && res.location) {
        let next: string
        try { next = new URL(res.location, current).toString() } catch { hop.error = 'Invalid Location header'; break }
        if (!/^https?:/i.test(next)) { hop.error = 'Redirects to a non-HTTP scheme'; break }
        if (current.startsWith('https:') && next.startsWith('http:')) insecureDowngrade = true
        if (i === maxHops - 1) { truncated = true; break }
        current = next
        continue
      }
      break
    } catch (error) {
      hops.push({ url: current, status: null, location: null, latencyMs: deps.now() - t0, error: error instanceof Error ? error.message.slice(0, 300) : 'Request failed' })
      break
    }
  }
  return { hops, finalUrl: current, totalMs: deps.now() - started, loop, truncated, insecureDowngrade }
}
