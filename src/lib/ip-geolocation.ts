import { isIP } from 'node:net'

type Geo = { country: string | null; region: string | null; city: string | null }

const cache = new Map<string, { expires: number; value: Geo | null }>()
const inflight = new Map<string, Promise<Geo | null>>()
const TTL = 6 * 60 * 60_000
const NEGATIVE_TTL = 60_000
const MAX_ENTRIES = 10_000

function remember(ip: string, value: Geo | null, ttl: number) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.delete(ip)
  cache.set(ip, { expires: Date.now() + ttl, value })
}

async function lookup(ip: string): Promise<Geo | null> {
  try {
    const r = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json`, {
      headers: { Authorization: `Bearer ${process.env.IPINFO_TOKEN}` },
      signal: AbortSignal.timeout(800),
      cache: 'no-store',
    })
    if (!r.ok) { remember(ip, null, NEGATIVE_TTL); return null }
    const b = (await r.json()) as Record<string, unknown>
    const value: Geo = {
      country: typeof b.country === 'string' && /^[A-Z]{2}$/.test(b.country) ? b.country : null,
      region: typeof b.region === 'string' ? b.region : null,
      city: typeof b.city === 'string' ? b.city : null,
    }
    remember(ip, value, TTL)
    return value
  } catch {
    // Negative-cache failures briefly so a slow provider cannot stall every redirect for the same IP.
    remember(ip, null, NEGATIVE_TTL)
    return null
  }
}

export async function resolveIpGeolocation(ip: string | null): Promise<Geo | null> {
  if (!ip || isIP(ip) === 0) return null
  const hit = cache.get(ip)
  if (hit && hit.expires > Date.now()) return hit.value
  if (!process.env.IPINFO_TOKEN) return null
  const pending = inflight.get(ip)
  if (pending) return pending
  const p = lookup(ip).finally(() => inflight.delete(ip))
  inflight.set(ip, p)
  return p
}

export function __resetGeoCacheForTests() {
  cache.clear()
  inflight.clear()
}
