import { MAX_IMPORT_ROWS, aliasFromShortLink, buildImportRows, parseImportTags, type ParsedImport, type RawImportRecord } from './bulk-import'

/**
 * Pulls links straight from a competitor's API with the user's token, so a
 * migration doesn't depend on whatever their CSV export happens to include.
 *
 * The token is used for this request only: never stored, logged or echoed.
 * Hosts are fixed (no user-supplied base URL), so this can't be turned into
 * an SSRF primitive.
 */

export type ImportProvider = 'bitly' | 'shortio' | 'rebrandly'
export const IMPORT_PROVIDERS: readonly ImportProvider[] = ['bitly', 'shortio', 'rebrandly']

export class ProviderImportError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type Options = { fetchImpl?: FetchLike; sleep?: (ms: number) => Promise<void>; deadlineMs?: number; maxRows?: number }

const REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_DEADLINE_MS = 45_000
const MAX_RETRIES = 3

const PROVIDER_NAME: Record<ImportProvider, string> = { bitly: 'Bitly', shortio: 'Short.io', rebrandly: 'Rebrandly' }

/** GET JSON with a timeout, bounded retries on 429/5xx (honouring Retry-After), and clean errors. */
async function getJson(provider: ImportProvider, url: string, headers: Record<string, string>, opts: Required<Pick<Options, 'fetchImpl' | 'sleep'>> & { deadline: number }): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    if (Date.now() > opts.deadline) throw new ProviderImportError(`${PROVIDER_NAME[provider]} took too long to respond; try again or filter the import`, 504)
    let res: Response
    try {
      res = await opts.fetchImpl(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'error' })
    } catch {
      if (attempt < MAX_RETRIES) { await opts.sleep(500 * 2 ** attempt); continue }
      throw new ProviderImportError(`Could not reach ${PROVIDER_NAME[provider]}`, 502)
    }
    if (res.ok) return res.json().catch(() => { throw new ProviderImportError(`${PROVIDER_NAME[provider]} returned an unreadable response`, 502) })
    if (res.status === 401 || res.status === 403) throw new ProviderImportError(`${PROVIDER_NAME[provider]} rejected the token. Check it has read access to links.`, 400)
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after'))
      await opts.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 500 * 2 ** attempt)
      continue
    }
    if (res.status === 404) throw new ProviderImportError(`${PROVIDER_NAME[provider]} could not find that account, group or domain`, 400)
    throw new ProviderImportError(`${PROVIDER_NAME[provider]} returned an error (${res.status})`, 502)
  }
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const asString = (v: unknown): string => (typeof v === 'string' ? v : '')
const asTags = (v: unknown): string[] => parseImportTags(asArray(v).filter((t): t is string => typeof t === 'string').join(','))

/** Bitly: user's default group (or the given one), paged with search_after. Custom back-halves win over the bit.ly hash. */
async function fetchBitly(token: string, scope: string | undefined, ctx: Required<Pick<Options, 'fetchImpl' | 'sleep'>> & { deadline: number }, maxRows: number) {
  const headers = { authorization: `Bearer ${token}` }
  let group = scope
  if (!group) {
    const user = (await getJson('bitly', 'https://api-ssl.bitly.com/v4/user', headers, ctx)) as { default_group_guid?: unknown }
    group = asString(user.default_group_guid)
    if (!group) throw new ProviderImportError('This Bitly account has no default group; pass a group GUID', 400)
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(group)) throw new ProviderImportError('Invalid Bitly group GUID', 400)
  const records: RawImportRecord[] = []
  let searchAfter = ''
  let truncated = false
  do {
    const q = new URLSearchParams({ size: '100', archived: 'off' })
    if (searchAfter) q.set('search_after', searchAfter)
    const page = (await getJson('bitly', `https://api-ssl.bitly.com/v4/groups/${group}/bitlinks?${q}`, headers, ctx)) as { links?: unknown; pagination?: { search_after?: unknown } }
    for (const item of asArray(page.links) as Array<Record<string, unknown>>) {
      if (records.length >= maxRows) { truncated = true; break }
      const custom = asArray(item.custom_bitlinks).map(asString).find(Boolean)
      records.push({
        url: asString(item.long_url),
        alias: aliasFromShortLink(custom || asString(item.link) || asString(item.id)),
        title: asString(item.title),
        tags: asTags(item.tags),
      })
    }
    const next = asString(page.pagination?.search_after)
    searchAfter = next && next !== searchAfter ? next : ''
  } while (searchAfter && !truncated)
  return { records, truncated }
}

/** Short.io: links live per domain; the hostname picks one (first domain by default). Paged with pageToken. */
async function fetchShortio(token: string, scope: string | undefined, ctx: Required<Pick<Options, 'fetchImpl' | 'sleep'>> & { deadline: number }, maxRows: number) {
  const headers = { authorization: token }
  const domains = asArray(await getJson('shortio', 'https://api.short.io/api/domains', headers, ctx)) as Array<{ id?: unknown; hostname?: unknown }>
  const wanted = scope?.trim().toLowerCase()
  const domain = wanted ? domains.find((d) => asString(d.hostname).toLowerCase() === wanted) : domains[0]
  if (!domain || typeof domain.id !== 'number') throw new ProviderImportError(wanted ? `No Short.io domain named ${wanted}` : 'This Short.io account has no domains', 400)
  const records: RawImportRecord[] = []
  let pageToken = ''
  let truncated = false
  do {
    const q = new URLSearchParams({ domain_id: String(domain.id), limit: '150' })
    if (pageToken) q.set('pageToken', pageToken)
    const page = (await getJson('shortio', `https://api.short.io/api/links?${q}`, headers, ctx)) as { links?: unknown; nextPageToken?: unknown }
    for (const item of asArray(page.links) as Array<Record<string, unknown>>) {
      if (records.length >= maxRows) { truncated = true; break }
      if (item.archived === true) continue
      records.push({ url: asString(item.originalURL), alias: asString(item.path) || null, title: asString(item.title), tags: asTags(item.tags) })
    }
    const next = asString(page.nextPageToken)
    pageToken = next && next !== pageToken ? next : ''
  } while (pageToken && !truncated)
  return { records, truncated }
}

/** Rebrandly: keyset pagination with `last=<id>`, 25 per page (their maximum). Optional domain filter. */
async function fetchRebrandly(token: string, scope: string | undefined, ctx: Required<Pick<Options, 'fetchImpl' | 'sleep'>> & { deadline: number }, maxRows: number) {
  const headers = { apikey: token }
  const records: RawImportRecord[] = []
  let last = ''
  let truncated = false
  for (;;) {
    const q = new URLSearchParams({ limit: '25', orderBy: 'createdAt', orderDir: 'desc' })
    if (scope) q.set('domain.fullName', scope.trim().toLowerCase())
    if (last) q.set('last', last)
    const page = asArray(await getJson('rebrandly', `https://api.rebrandly.com/v1/links?${q}`, headers, ctx)) as Array<Record<string, unknown>>
    for (const item of page) {
      if (records.length >= maxRows) { truncated = true; break }
      records.push({ url: asString(item.destination), alias: asString(item.slashtag) || null, title: asString(item.title), tags: [] })
    }
    const next = asString(page.at(-1)?.id)
    if (truncated || page.length < 25 || !next || next === last) break
    last = next
  }
  return { records, truncated }
}

export async function fetchProviderImport(
  provider: ImportProvider,
  token: string,
  scope: string | undefined,
  options: Options = {},
): Promise<ParsedImport & { truncated?: boolean }> {
  const ctx = {
    fetchImpl: options.fetchImpl ?? ((input: string, init?: RequestInit) => fetch(input, init)),
    sleep: options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    deadline: Date.now() + (options.deadlineMs ?? DEFAULT_DEADLINE_MS),
  }
  const maxRows = options.maxRows ?? MAX_IMPORT_ROWS
  const fetchers = { bitly: fetchBitly, shortio: fetchShortio, rebrandly: fetchRebrandly }
  const { records, truncated } = await fetchers[provider](token, scope, ctx, maxRows)
  if (records.length === 0) return { error: `No links found in this ${PROVIDER_NAME[provider]} account` }
  const rows = buildImportRows(records, 1)
  return { source: provider, rows, totalRows: rows.length, truncated }
}
