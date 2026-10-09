import { promises as dns } from 'node:dns'

/**
 * One-click DNS setup for branded domains.
 *
 * The user pastes a short-lived, DNS-scoped API token for the provider that
 * hosts their zone; we write the verification TXT and routing CNAME, then
 * forget the token. It is never stored, logged, or echoed in errors.
 *
 * Safety rules:
 *  - We only touch the two records we own (the `_quicklink-verification`
 *    TXT and the host's CNAME/ALIAS). Re-running is idempotent.
 *  - An existing A/AAAA/CNAME at the host pointing elsewhere is a live
 *    website: we refuse unless the caller explicitly passes `replaceExisting`.
 */

export type DnsProvider = 'cloudflare' | 'vercel'
export type DesiredRecord = { type: 'TXT' | 'CNAME'; name: string; value: string }
export type AppliedRecord = DesiredRecord & { action: 'created' | 'updated' | 'unchanged' }

export class DnsSetupError extends Error {
  constructor(message: string, readonly status: number = 400, readonly code = 'dns_setup_failed') {
    super(message)
  }
}

type Fetch = typeof fetch
const TIMEOUT_MS = 8_000

/** Candidate zone apexes from most to least specific, excluding the bare TLD. */
export function zoneCandidates(host: string): string[] {
  const labels = host.split('.')
  const out: string[] = []
  for (let i = 0; i < labels.length - 1; i++) out.push(labels.slice(i).join('.'))
  return out
}

/** Which supported provider serves this zone, from its NS records. */
export async function detectDnsProvider(host: string, resolveNs: (name: string) => Promise<string[]> = dns.resolveNs): Promise<DnsProvider | null> {
  for (const zone of zoneCandidates(host)) {
    let servers: string[]
    try {
      servers = await resolveNs(zone)
    } catch {
      continue
    }
    if (!servers.length) continue
    const all = servers.map((s) => s.toLowerCase().replace(/\.$/, ''))
    if (all.every((s) => s.endsWith('.ns.cloudflare.com'))) return 'cloudflare'
    if (all.every((s) => s.endsWith('.vercel-dns.com'))) return 'vercel'
    return null
  }
  return null
}

async function call<T>(fetchImpl: Fetch, provider: string, url: string, token: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  let res: Response
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new DnsSetupError(`${provider} did not respond. Try again in a moment.`, 502, 'provider_unreachable')
  }
  if (res.status === 401 || res.status === 403) {
    throw new DnsSetupError(`${provider} rejected the token. It needs DNS edit permission for this domain.`, 400, 'token_rejected')
  }
  if (res.status === 429) throw new DnsSetupError(`${provider} is rate limiting requests. Try again in a minute.`, 429, 'provider_rate_limited')
  const body = (await res.json().catch(() => ({}))) as T
  return { status: res.status, body }
}

const sameTarget = (a: string, b: string) => a.toLowerCase().replace(/\.$/, '') === b.toLowerCase().replace(/\.$/, '')
const unquote = (value: string) => value.replace(/^"(.*)"$/, '$1')

// ─── Cloudflare ────────────────────────────────────────────────────────────

type CfEnvelope<T> = { success?: boolean; result?: T; errors?: Array<{ message?: string }> }
type CfRecord = { id: string; type: string; name: string; content: string }

async function cloudflareZone(fetchImpl: Fetch, token: string, host: string): Promise<{ id: string; name: string }> {
  for (const candidate of zoneCandidates(host)) {
    const { body } = await call<CfEnvelope<Array<{ id: string; name: string }>>>(fetchImpl, 'Cloudflare', `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(candidate)}&status=active`, token)
    const zone = body.result?.[0]
    if (zone) return zone
  }
  throw new DnsSetupError(`No active Cloudflare zone for ${host} is visible to this token.`, 404, 'zone_not_found')
}

async function applyCloudflare(fetchImpl: Fetch, token: string, host: string, records: DesiredRecord[], replaceExisting: boolean): Promise<AppliedRecord[]> {
  const zone = await cloudflareZone(fetchImpl, token, host)
  const base = `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`
  const applied: AppliedRecord[] = []
  for (const record of records) {
    const { body } = await call<CfEnvelope<CfRecord[]>>(fetchImpl, 'Cloudflare', `${base}?name=${encodeURIComponent(record.name)}&per_page=100`, token)
    const existing = body.result ?? []
    // Cloudflare forbids a CNAME beside any other record at the same name.
    const conflicting = record.type === 'CNAME' ? existing.filter((r) => ['A', 'AAAA', 'CNAME'].includes(r.type)) : existing.filter((r) => r.type === 'TXT' && unquote(r.content).startsWith('quicklink-site-verification='))
    const match = conflicting.find((r) => r.type === record.type && sameTarget(unquote(r.content), record.value))
    if (match) {
      applied.push({ ...record, action: 'unchanged' })
      continue
    }
    if (record.type === 'CNAME' && conflicting.length && !replaceExisting) {
      throw new DnsSetupError(`${host} already points somewhere else (${conflicting[0].type} ${conflicting[0].content}). Confirm to replace it.`, 409, 'record_conflict')
    }
    const payload = JSON.stringify({ type: record.type, name: record.name, content: record.type === 'TXT' ? `"${record.value}"` : record.value, ttl: 300, ...(record.type === 'CNAME' ? { proxied: false } : {}) })
    if (conflicting.length) {
      // Replace in place: update the first, delete the rest (e.g. A + AAAA).
      const [first, ...rest] = conflicting
      if (first.type === record.type) {
        await expectCf(call<CfEnvelope<CfRecord>>(fetchImpl, 'Cloudflare', `${base}/${first.id}`, token, { method: 'PUT', body: payload }))
      } else {
        await expectCf(call<CfEnvelope<unknown>>(fetchImpl, 'Cloudflare', `${base}/${first.id}`, token, { method: 'DELETE' }))
        await expectCf(call<CfEnvelope<CfRecord>>(fetchImpl, 'Cloudflare', base, token, { method: 'POST', body: payload }))
      }
      for (const extra of rest) await expectCf(call<CfEnvelope<unknown>>(fetchImpl, 'Cloudflare', `${base}/${extra.id}`, token, { method: 'DELETE' }))
      applied.push({ ...record, action: 'updated' })
    } else {
      await expectCf(call<CfEnvelope<CfRecord>>(fetchImpl, 'Cloudflare', base, token, { method: 'POST', body: payload }))
      applied.push({ ...record, action: 'created' })
    }
  }
  return applied
}

async function expectCf<T>(promise: Promise<{ status: number; body: CfEnvelope<T> }>): Promise<void> {
  const { status, body } = await promise
  if (status >= 400 || body.success === false) {
    const reason = body.errors?.[0]?.message?.slice(0, 200) ?? `HTTP ${status}`
    throw new DnsSetupError(`Cloudflare refused the change: ${reason}`, 502, 'provider_error')
  }
}

// ─── Vercel DNS ────────────────────────────────────────────────────────────

type VercelRecord = { id: string; name: string; type: string; value: string }

async function vercelZone(fetchImpl: Fetch, token: string, host: string, teamQuery: string): Promise<string> {
  for (const candidate of zoneCandidates(host)) {
    const { status } = await call<unknown>(fetchImpl, 'Vercel', `https://api.vercel.com/v5/domains/${encodeURIComponent(candidate)}${teamQuery}`, token)
    if (status === 200) return candidate
  }
  throw new DnsSetupError(`No Vercel domain for ${host} is visible to this token.`, 404, 'zone_not_found')
}

async function applyVercel(fetchImpl: Fetch, token: string, host: string, records: DesiredRecord[], replaceExisting: boolean, teamId?: string): Promise<AppliedRecord[]> {
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
  const zone = await vercelZone(fetchImpl, token, host, teamQuery)
  const base = `https://api.vercel.com`
  const { body } = await call<{ records?: VercelRecord[] }>(fetchImpl, 'Vercel', `${base}/v4/domains/${encodeURIComponent(zone)}/records${teamQuery}${teamQuery ? '&' : '?'}limit=100`, token)
  const all = body.records ?? []
  const relative = (name: string) => (name === zone ? '' : name.slice(0, -(zone.length + 1)))
  const applied: AppliedRecord[] = []
  for (const record of records) {
    const name = relative(record.name)
    // Vercel has no CNAME at the apex; ALIAS is its equivalent.
    const type = record.type === 'CNAME' && name === '' ? 'ALIAS' : record.type
    const here = all.filter((r) => r.name === name)
    const conflicting = record.type === 'CNAME' ? here.filter((r) => ['A', 'AAAA', 'CNAME', 'ALIAS'].includes(r.type)) : here.filter((r) => r.type === 'TXT' && r.value.startsWith('quicklink-site-verification='))
    if (conflicting.some((r) => r.type === type && sameTarget(r.value, record.value))) {
      applied.push({ ...record, action: 'unchanged' })
      continue
    }
    if (record.type === 'CNAME' && conflicting.length && !replaceExisting) {
      throw new DnsSetupError(`${host} already points somewhere else (${conflicting[0].type} ${conflicting[0].value}). Confirm to replace it.`, 409, 'record_conflict')
    }
    for (const old of conflicting) {
      const res = await call<unknown>(fetchImpl, 'Vercel', `${base}/v2/domains/${encodeURIComponent(zone)}/records/${old.id}${teamQuery}`, token, { method: 'DELETE' })
      if (res.status >= 400 && res.status !== 404) throw new DnsSetupError(`Vercel refused to remove the old record (HTTP ${res.status}).`, 502, 'provider_error')
    }
    const created = await call<{ error?: { message?: string } }>(fetchImpl, 'Vercel', `${base}/v2/domains/${encodeURIComponent(zone)}/records${teamQuery}`, token, {
      method: 'POST',
      body: JSON.stringify({ name, type, value: record.value, ttl: 300 }),
    })
    if (created.status >= 400) throw new DnsSetupError(`Vercel refused the change: ${created.body.error?.message?.slice(0, 200) ?? `HTTP ${created.status}`}`, 502, 'provider_error')
    applied.push({ ...record, action: conflicting.length ? 'updated' : 'created' })
  }
  return applied
}

export async function applyDnsRecords(input: {
  provider: DnsProvider
  token: string
  host: string
  records: DesiredRecord[]
  replaceExisting?: boolean
  teamId?: string
  fetchImpl?: Fetch
}): Promise<AppliedRecord[]> {
  const fetchImpl = input.fetchImpl ?? fetch
  const replace = input.replaceExisting === true
  return input.provider === 'cloudflare'
    ? applyCloudflare(fetchImpl, input.token, input.host, input.records, replace)
    : applyVercel(fetchImpl, input.token, input.host, input.records, replace, input.teamId)
}
