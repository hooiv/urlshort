import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  url: { findMany: vi.fn() },
  webhookEndpoint: { findMany: vi.fn() },
  webhookDelivery: { createMany: vi.fn() },
  $transaction: vi.fn(),
}))
const reserveMock = vi.hoisted(() => vi.fn())

vi.mock('./prisma', () => ({ prisma: prismaMock }))
vi.mock('./destination-health', () => ({ assertDestinationSafeForStorage: vi.fn() }))
vi.mock('./tenant-usage', () => ({ reserveUsageInTransaction: reserveMock }))

import { dispatchWebhooksForUrls, planWebhookFanout } from './webhooks'

const endpoint = (over: Partial<{ id: string; workspaceId: string | null; userId: string | null; linkScope: string; tagFilter: string[]; urlIdFilter: string[]; folderIdFilter: string[] }>) => ({
  id: 'ep', workspaceId: null, userId: null, linkScope: 'all', tagFilter: [], urlIdFilter: [], ...over,
})

describe('planWebhookFanout', () => {
  const links = new Map([
    ['u1', { id: 'u1', workspaceId: 'ws_a', userId: 'user_a', tags: ['launch'] }],
    ['u2', { id: 'u2', workspaceId: 'ws_b', userId: 'user_b', tags: [] }],
  ])

  it('never delivers across tenants', () => {
    const plan = planWebhookFanout(
      [{ urlId: 'u1', payload: { n: 1 } }, { urlId: 'u2', payload: { n: 2 } }],
      links,
      [endpoint({ id: 'a', workspaceId: 'ws_a' }), endpoint({ id: 'b', userId: 'user_b' })],
    )
    expect(plan.map(p => [p.endpointId, p.payload.n])).toEqual([['a', 1], ['b', 2]])
  })

  it('applies tag and link filters', () => {
    const plan = planWebhookFanout(
      [{ urlId: 'u1', payload: {} }],
      links,
      [
        endpoint({ id: 'tag-hit', workspaceId: 'ws_a', linkScope: 'tags', tagFilter: ['launch'] }),
        endpoint({ id: 'tag-miss', workspaceId: 'ws_a', linkScope: 'tags', tagFilter: ['other'] }),
        endpoint({ id: 'link-hit', userId: 'user_a', linkScope: 'links', urlIdFilter: ['u1'] }),
        endpoint({ id: 'link-miss', userId: 'user_a', linkScope: 'links', urlIdFilter: ['u2'] }),
      ],
    )
    expect(plan.map(p => p.endpointId)).toEqual(['tag-hit', 'link-hit'])
  })

  it('routes workspace endpoints by workspace only and filters by folder', () => {
    const folderLinks = new Map([
      ['f1', { id: 'f1', workspaceId: 'ws_a', userId: 'user_x', tags: [], folderId: 'fold_1' }],
      ['p1', { id: 'p1', workspaceId: null, userId: 'user_x', tags: [] }],
    ])
    const plan = planWebhookFanout(
      [{ urlId: 'f1', payload: {} }, { urlId: 'p1', payload: {} }],
      folderLinks,
      [
        endpoint({ id: 'folder-hit', workspaceId: 'ws_a', linkScope: 'folders', folderIdFilter: ['fold_1'] }),
        endpoint({ id: 'folder-miss', workspaceId: 'ws_a', linkScope: 'folders', folderIdFilter: ['fold_2'] }),
        // A workspace endpoint must not pick up a member's personal links even if a userId lingers on it.
        endpoint({ id: 'ws-all', workspaceId: 'ws_a', userId: 'user_x' }),
      ],
    )
    expect(plan.map(p => p.endpointId)).toEqual(['folder-hit', 'ws-all'])
  })

  it('skips items whose link no longer exists', () => {
    expect(planWebhookFanout([{ urlId: 'gone', payload: {} }], links, [endpoint({ workspaceId: 'ws_a' })])).toEqual([])
  })
})

describe('dispatchWebhooksForUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
  })

  it('uses a constant number of queries for a large batch', async () => {
    prismaMock.url.findMany.mockResolvedValue([{ id: 'u1', workspaceId: 'ws_a', userId: 'user_a', tags: [] }])
    prismaMock.webhookEndpoint.findMany.mockResolvedValue([endpoint({ id: 'a', workspaceId: 'ws_a' })])
    reserveMock.mockResolvedValue({ allowed: true, used: 0n, limit: null })

    const items = Array.from({ length: 1000 }, (_, i) => ({ urlId: 'u1', payload: { i } }))
    const result = await dispatchWebhooksForUrls('link.clicked', items)

    expect(result).toEqual({ enqueued: 1000, droppedForQuota: 0 })
    expect(prismaMock.url.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.webhookEndpoint.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.webhookDelivery.createMany).toHaveBeenCalledTimes(1)
    expect(reserveMock).toHaveBeenCalledTimes(1)
    expect(reserveMock).toHaveBeenCalledWith(prismaMock, 'ws_a', 'webhook_deliveries', 1000n)
  })

  it('drops only the over-quota workspace', async () => {
    prismaMock.url.findMany.mockResolvedValue([
      { id: 'u1', workspaceId: 'ws_a', userId: null, tags: [] },
      { id: 'u2', workspaceId: 'ws_b', userId: null, tags: [] },
    ])
    prismaMock.webhookEndpoint.findMany.mockResolvedValue([endpoint({ id: 'a', workspaceId: 'ws_a' }), endpoint({ id: 'b', workspaceId: 'ws_b' })])
    reserveMock.mockImplementation(async (_tx: unknown, ws: string) => ({ allowed: ws !== 'ws_b', used: 0n, limit: 10n }))

    const result = await dispatchWebhooksForUrls('link.clicked', [{ urlId: 'u1', payload: {} }, { urlId: 'u2', payload: {} }])

    expect(result).toEqual({ enqueued: 1, droppedForQuota: 1 })
    const rows = prismaMock.webhookDelivery.createMany.mock.calls[0][0].data
    expect(rows.map((r: { endpointId: string }) => r.endpointId)).toEqual(['a'])
  })

  it('short-circuits without touching endpoints for ownerless links', async () => {
    prismaMock.url.findMany.mockResolvedValue([{ id: 'u1', workspaceId: null, userId: null, tags: [] }])
    const result = await dispatchWebhooksForUrls('link.clicked', [{ urlId: 'u1', payload: {} }])
    expect(result).toEqual({ enqueued: 0, droppedForQuota: 0 })
    expect(prismaMock.webhookEndpoint.findMany).not.toHaveBeenCalled()
  })

  it('scopes the endpoint query to the owners it read', async () => {
    prismaMock.url.findMany.mockResolvedValue([{ id: 'u1', workspaceId: 'ws_a', userId: 'user_a', tags: [] }])
    prismaMock.webhookEndpoint.findMany.mockResolvedValue([])
    await dispatchWebhooksForUrls('link.clicked', [{ urlId: 'u1', payload: {} }])
    expect(prismaMock.webhookEndpoint.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
      events: { has: 'link.clicked' },
      OR: [{ workspaceId: { in: ['ws_a'] } }, { userId: { in: ['user_a'] } }],
    })
  })
})
