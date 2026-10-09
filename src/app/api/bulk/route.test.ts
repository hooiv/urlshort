import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const prismaMock = vi.hoisted(() => ({
  membership: { findUnique: vi.fn() },
  folder: { findFirst: vi.fn() },
  url: { findMany: vi.fn(), createManyAndReturn: vi.fn() },
  destinationRevision: { createMany: vi.fn() },
  $transaction: vi.fn(),
}))
const safeMock = vi.hoisted(() => vi.fn())
const dispatchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user_a' })) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/destination-health', () => ({ assertDestinationSafeForStorage: safeMock }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/routing-config', () => ({ publishWorkspaceRoutingConfig: vi.fn() }))
vi.mock('@/lib/webhooks', () => ({ dispatchWebhooksForUrls: dispatchMock }))
const keyMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-keys', async (orig) => ({ ...(await orig<typeof import('@/lib/api-keys')>()), authenticateApiKey: keyMock }))

import { POST, bulkCsvSchema, normalizeBulkTags } from './route'

const post = (body: unknown) => POST(new NextRequest('https://ql.test/api/bulk', { method: 'POST', body: JSON.stringify(body) }))

describe('bulkCsvSchema', () => {
  it('rejects empty payloads and unknown conflict policies', () => {
    expect(bulkCsvSchema.safeParse({ csv: '' }).success).toBe(false)
    expect(bulkCsvSchema.safeParse({}).success).toBe(false)
    expect(bulkCsvSchema.safeParse({ csv: 'originalUrl\nhttps://example.com', onConflict: 'overwrite' }).success).toBe(false)
    expect(bulkCsvSchema.safeParse({ csv: 'originalUrl\nhttps://example.com', onConflict: 'generate' }).success).toBe(true)
  })
})

describe('normalizeBulkTags', () => {
  it('lowercases, dedupes, drops invalid tags and caps at 10', () => {
    expect(normalizeBulkTags('News; news ; A!;ok-tag')).toEqual(['news', 'ok-tag'])
    expect(normalizeBulkTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(';'))).toHaveLength(10)
  })
})

describe('POST /api/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock))
    prismaMock.url.findMany.mockResolvedValue([])
    prismaMock.url.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<Record<string, unknown>> }) =>
      data.map((row, i) => ({ id: `id_${i}`, shortCode: row.shortCode, originalUrl: row.originalUrl, title: row.title, tags: row.tags })))
    safeMock.mockResolvedValue(undefined)
  })

  it('imports a Bitly export, keeping back-halves and reporting every row', async () => {
    const csv = [
      'Bitlink,Long URL,Title,Tags',
      'bit.ly/spring-sale,https://shop.example.com/spring,"Spring, 2026",promo|spring',
      'bit.ly/x,https://shop.example.com/x,,',
      'bit.ly/docs-home,javascript:alert(1),,',
    ].join('\n')
    const res = await post({ csv })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.source).toBe('bitly')
    expect(body.summary).toEqual({ total: 3, created: 1, skipped: 2 })
    expect(body.results).toEqual([
      { row: 2, status: 'created', shortCode: 'spring-sale', originalUrl: 'https://shop.example.com/spring' },
      expect.objectContaining({ row: 3, status: 'skipped', reason: expect.stringContaining('Alias') }),
      expect.objectContaining({ row: 4, status: 'skipped' }),
    ])
    const inserted = prismaMock.url.createManyAndReturn.mock.calls[0][0]
    expect(inserted.skipDuplicates).toBe(true)
    expect(inserted.data[0]).toMatchObject({ title: 'Spring, 2026', tags: ['promo', 'spring'], userId: 'user_a', riskStatus: expect.any(String) })
    expect(prismaMock.destinationRevision.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ urlId: 'id_0', reason: 'Imported' })] })
    expect(dispatchMock).toHaveBeenCalledWith('link.created', [expect.objectContaining({ urlId: 'id_0' })])
  })

  it('checks each distinct host once and skips unsafe hosts', async () => {
    safeMock.mockImplementation(async (url: string) => { if (url.includes('internal')) throw new Error('Private IP destinations are not allowed') })
    const csv = ['originalUrl', 'https://a.example.com/1', 'https://a.example.com/2', 'https://internal.example.com/'].join('\n')
    const body = await (await post({ csv })).json()
    expect(safeMock).toHaveBeenCalledTimes(2)
    expect(body.results[2]).toMatchObject({ status: 'skipped', reason: 'Private IP destinations are not allowed' })
    expect(body.summary.created).toBe(2)
  })

  it('reports taken aliases, or re-codes them when asked', async () => {
    prismaMock.url.findMany.mockResolvedValue([{ shortCode: 'launch' }])
    const csv = 'originalUrl,customAlias\nhttps://example.com/a,launch'
    const skipped = await (await post({ csv })).json()
    expect(skipped.results[0]).toMatchObject({ status: 'skipped', reason: 'Alias "launch" is already taken' })
    const generated = await (await post({ csv, onConflict: 'generate' })).json()
    expect(generated.results[0]).toMatchObject({ status: 'created', reason: expect.stringContaining('generated code') })
    expect(generated.results[0].shortCode).not.toBe('launch')
  })

  it('reports rows lost to a concurrent insert instead of failing the import', async () => {
    prismaMock.url.createManyAndReturn.mockResolvedValue([])
    const body = await (await post({ csv: 'originalUrl,customAlias\nhttps://example.com/a,race-me' })).json()
    expect(body.results[0]).toMatchObject({ status: 'skipped', reason: 'Alias "race-me" was taken during import' })
  })

  it('accepts API keys only with links:write', async () => {
    const keyed = (body: unknown) => POST(new NextRequest('https://ql.test/api/bulk', { method: 'POST', headers: { 'x-api-key': 'qlk_test' }, body: JSON.stringify(body) }))
    keyMock.mockResolvedValueOnce({ userId: 'user_k', apiKeyId: 'k', scopes: ['analytics:read'] })
    expect((await keyed({ csv: 'originalUrl\nhttps://example.com' })).status).toBe(403)
    keyMock.mockResolvedValueOnce({ userId: 'user_k', apiKeyId: 'k', scopes: ['links:write'] })
    expect((await keyed({ csv: 'originalUrl\nhttps://example.com' })).status).toBe(201)
    expect(prismaMock.url.createManyAndReturn.mock.lastCall![0].data[0].userId).toBe('user_k')
  })

  it('enforces workspace edit rights', async () => {
    prismaMock.membership.findUnique.mockResolvedValueOnce(null)
    expect((await post({ csv: 'originalUrl\nhttps://example.com', workspaceId: 'ws_1' })).status).toBe(403)
    prismaMock.membership.findUnique.mockResolvedValueOnce({ role: 'viewer' })
    expect((await post({ csv: 'originalUrl\nhttps://example.com', workspaceId: 'ws_1' })).status).toBe(403)
    prismaMock.membership.findUnique.mockResolvedValueOnce({ role: 'editor' })
    expect((await post({ csv: 'originalUrl\nhttps://example.com', workspaceId: 'ws_1' })).status).toBe(201)
    expect(prismaMock.url.createManyAndReturn.mock.calls[0][0].data[0].workspaceId).toBe('ws_1')
  })

  it('imports into a folder only when the member can write to it', async () => {
    const csv = 'originalUrl\nhttps://example.com'
    expect((await post({ csv, folderId: 'f_1' })).status).toBe(400)
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'editor' })
    prismaMock.folder.findFirst.mockResolvedValueOnce({ restricted: true, access: [] })
    expect((await post({ csv, workspaceId: 'ws_1', folderId: 'f_1' })).status).toBe(404)
    prismaMock.folder.findFirst.mockResolvedValueOnce({ restricted: true, access: [{ role: 'viewer' }] })
    expect((await post({ csv, workspaceId: 'ws_1', folderId: 'f_1' })).status).toBe(403)
    prismaMock.folder.findFirst.mockResolvedValueOnce({ restricted: false, access: [] })
    expect((await post({ csv, workspaceId: 'ws_1', folderId: 'f_1' })).status).toBe(201)
    expect(prismaMock.url.createManyAndReturn.mock.lastCall![0].data[0].folderId).toBe('f_1')
    prismaMock.membership.findUnique.mockReset()
  })

  it('rejects files without a destination column', async () => {
    const res = await post({ csv: 'foo,bar\n1,2' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/destination column/)
  })
})
