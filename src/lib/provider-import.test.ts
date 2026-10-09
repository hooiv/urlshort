import { describe, expect, it, vi } from 'vitest'
import { ProviderImportError, fetchProviderImport } from './provider-import'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers })
const noSleep = async () => {}

function router(routes: Array<[RegExp, () => Response]>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: init?.headers as Record<string, string> })
    const hit = routes.find(([re]) => re.test(url))
    if (!hit) throw new Error(`unexpected ${url}`)
    return hit[1]()
  })
  return { fetchImpl, calls }
}

describe('fetchProviderImport', () => {
  it('pages Bitly by search_after, prefers custom back-halves and keeps tags', async () => {
    let page = 0
    const { fetchImpl, calls } = router([
      [/\/v4\/user$/, () => json({ default_group_guid: 'Bg1' })],
      [/\/groups\/Bg1\/bitlinks/, () => (++page === 1
        ? json({ links: [{ id: 'bit.ly/3abcd', long_url: 'https://example.com/a', title: 'A', tags: ['Launch'], custom_bitlinks: ['https://brand.co/spring-sale'] }], pagination: { search_after: 'tok2' } })
        : json({ links: [{ id: 'bit.ly/4efgh', long_url: 'https://example.com/b', custom_bitlinks: [] }], pagination: { search_after: '' } }))],
    ])
    const result = await fetchProviderImport('bitly', 'tok_secret_123', undefined, { fetchImpl, sleep: noSleep })
    if ('error' in result) throw new Error(result.error)
    expect(result.rows.map((r) => [r.alias, r.url, r.tags])).toEqual([['spring-sale', 'https://example.com/a', ['launch']], ['4efgh', 'https://example.com/b', []]])
    expect(calls[2].url).toContain('search_after=tok2')
    expect(calls[0].headers.authorization).toBe('Bearer tok_secret_123')
  })

  it('stops at the row cap and flags truncation', async () => {
    const { fetchImpl } = router([[/bitlinks/, () => json({ links: Array.from({ length: 100 }, (_, i) => ({ id: `bit.ly/code${i}`, long_url: `https://example.com/${i}` })), pagination: { search_after: 'more' } })]])
    const result = await fetchProviderImport('bitly', 'tok_secret_123', 'Bgroup', { fetchImpl, sleep: noSleep, maxRows: 150 })
    expect(result).toMatchObject({ totalRows: 150, truncated: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('picks the Short.io domain by hostname and follows nextPageToken, skipping archived links', async () => {
    let page = 0
    const { fetchImpl, calls } = router([
      [/\/api\/domains$/, () => json([{ id: 1, hostname: 'a.co' }, { id: 7, hostname: 'go.brand.com' }])],
      [/\/api\/links\?/, () => (++page === 1
        ? json({ links: [{ originalURL: 'https://example.com/x', path: 'promo', tags: ['q4'] }, { originalURL: 'https://example.com/old', path: 'old', archived: true }], nextPageToken: 'p2' })
        : json({ links: [{ originalURL: 'https://example.com/y', path: 'docs' }], nextPageToken: null }))],
    ])
    const result = await fetchProviderImport('shortio', 'sk_live_token', 'GO.brand.com', { fetchImpl, sleep: noSleep })
    if ('error' in result) throw new Error(result.error)
    expect(result.rows.map((r) => r.alias)).toEqual(['promo', 'docs'])
    expect(calls[1].url).toContain('domain_id=7')
    expect(calls[2].url).toContain('pageToken=p2')
    expect(calls[0].headers.authorization).toBe('sk_live_token')
  })

  it('pages Rebrandly with last=<id> until a short page', async () => {
    let page = 0
    const { fetchImpl, calls } = router([[/rebrandly/, () => (++page === 1
      ? json(Array.from({ length: 25 }, (_, i) => ({ id: `id${i}`, slashtag: `tag${i}x`, destination: `https://example.com/${i}` })))
      : json([{ id: 'idz', slashtag: 'last-one', destination: 'https://example.com/z' }]))]])
    const result = await fetchProviderImport('rebrandly', 'rb_key_12345', undefined, { fetchImpl, sleep: noSleep })
    expect(result).toMatchObject({ totalRows: 26 })
    expect(calls[1].url).toContain('last=id24')
    expect(calls[0].headers.apikey).toBe('rb_key_12345')
  })

  it('retries 429 with Retry-After, and turns auth failures into a clear error', async () => {
    const sleep = vi.fn(noSleep)
    let n = 0
    const { fetchImpl } = router([[/bitlinks/, () => (++n === 1 ? json({}, 429, { 'retry-after': '2' }) : json({ links: [{ id: 'bit.ly/abcde', long_url: 'https://example.com' }] }))]])
    expect(await fetchProviderImport('bitly', 'tok_secret_123', 'Bg', { fetchImpl, sleep })).toMatchObject({ totalRows: 1 })
    expect(sleep).toHaveBeenCalledWith(2000)

    const denied = router([[/user/, () => json({ message: 'FORBIDDEN' }, 403)]])
    await expect(fetchProviderImport('bitly', 'tok_bad_123', undefined, { fetchImpl: denied.fetchImpl, sleep: noSleep })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('rejected the token') })
  })

  it('validates rows with the CSV rules and rejects injected group ids', async () => {
    const { fetchImpl } = router([[/bitlinks/, () => json({ links: [{ id: 'bit.ly/ok123', long_url: 'javascript:alert(1)' }] })]])
    const result = await fetchProviderImport('bitly', 'tok_secret_123', 'Bg', { fetchImpl, sleep: noSleep })
    if ('error' in result) throw new Error(result.error)
    expect(result.rows[0].error).toBeTruthy()
    await expect(fetchProviderImport('bitly', 'tok_secret_123', '../../admin', { fetchImpl, sleep: noSleep })).rejects.toBeInstanceOf(ProviderImportError)
  })
})
