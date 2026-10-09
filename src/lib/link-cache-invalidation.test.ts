import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mock = vi.hoisted(() => ({
  url: { findUnique: vi.fn() },
  domainLink: { findFirst: vi.fn() },
  destinationRevision: { findFirst: vi.fn() },
}))
vi.mock('./prisma', () => ({ prisma: mock }))

import {
  getLinkByCode,
  getLinkByDomainPath,
  getLatestRevision,
  invalidateLink,
  invalidateLinks,
  invalidateDomain,
  getLinkCacheStats,
  __resetLinkCacheForTests,
} from './link-cache'
import {
  __setBusTransportForTests,
  decodeInvalidation,
  encodeInvalidation,
  instanceId,
  LINK_CACHE_CHANNEL,
  MAX_KEYS_PER_MESSAGE,
  type BusTransport,
} from './link-cache-bus'

function row(id: string, shortCode: string, originalUrl = `https://${shortCode}.test`) {
  return {
    id, workspaceId: null, shortCode, originalUrl, title: null, description: null, ogImage: null, isActive: true,
    riskStatus: 'cleared', expiresAt: null, expiredUrl: null, passwordHash: null, metaPixelId: null, googleTagId: null,
    xPixelId: null, cloaked: false, webhookUrl: null, maxClicks: null, clicksReserved: 0, deletedAt: null, rules: [],
  }
}

/** In-memory transport: records publishes and lets the test drive the subscription. */
function fakeTransport() {
  const published: string[] = []
  let handlers: { message: (raw: string) => void; up: () => void; down: () => void } | null = null
  const transport: BusTransport = {
    publish: async (channel, message) => {
      expect(channel).toBe(LINK_CACHE_CHANNEL)
      published.push(message)
      return true
    },
    subscribe: async (_channel, h) => {
      handlers = h
      h.up()
      return () => { handlers = null }
    },
  }
  return { transport, published, deliver: (raw: string) => handlers?.message(raw), down: () => handlers?.down(), up: () => handlers?.up() }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('link cache invalidation', () => {
  beforeEach(() => {
    __setBusTransportForTests({ publish: async () => false, subscribe: async () => null })
    __resetLinkCacheForTests()
    vi.clearAllMocks()
  })
  afterEach(() => __setBusTransportForTests(null))

  it('evicts every custom-domain path that resolved to the link, not just its short code', async () => {
    let destination = 'https://old.test'
    mock.domainLink.findFirst.mockImplementation(async () => ({ url: row('u1', 'abc', destination) }))
    mock.url.findUnique.mockImplementation(async () => row('u1', 'abc', destination))

    expect((await getLinkByDomainPath('go.brand.com', '/launch'))?.originalUrl).toBe('https://old.test')
    expect((await getLinkByDomainPath('links.brand.com', '/x'))?.originalUrl).toBe('https://old.test')
    expect((await getLinkByCode('abc'))?.originalUrl).toBe('https://old.test')
    destination = 'https://new.test'

    await invalidateLink('abc', 'u1')

    expect((await getLinkByDomainPath('go.brand.com', '/launch'))?.originalUrl).toBe('https://new.test')
    expect((await getLinkByDomainPath('links.brand.com', '/x'))?.originalUrl).toBe('https://new.test')
    expect((await getLinkByCode('abc'))?.originalUrl).toBe('https://new.test')
    expect(mock.domainLink.findFirst).toHaveBeenCalledTimes(4)
  })

  it('leaves other links cached when one is invalidated', async () => {
    mock.url.findUnique.mockImplementation(async ({ where }: { where: { shortCode: string } }) => row(`id-${where.shortCode}`, where.shortCode))
    await getLinkByCode('a')
    await getLinkByCode('b')
    await invalidateLink('a', 'id-a')
    await getLinkByCode('a')
    await getLinkByCode('b')
    expect(mock.url.findUnique).toHaveBeenCalledTimes(3)
  })

  it('evicts negative domain entries when a domain is verified or a path is added', async () => {
    mock.domainLink.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ url: row('u2', 'zzz') })
    expect(await getLinkByDomainPath('new.brand.com', '/promo')).toBeNull()
    expect(await getLinkByDomainPath('new.brand.com', '/promo')).toBeNull()
    await invalidateDomain('new.brand.com')
    expect((await getLinkByDomainPath('new.brand.com', '/promo'))?.id).toBe('u2')
    expect(getLinkCacheStats().indexedHosts).toBe(1)
  })

  it('never caches a load that was in flight when the link was invalidated', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    mock.url.findUnique
      .mockImplementationOnce(async () => { await gate; return row('u3', 'race', 'https://before.test') })
      .mockImplementation(async () => row('u3', 'race', 'https://after.test'))

    const early = getLinkByCode('race')
    await tick()
    await invalidateLink('race', 'u3')
    // A reader arriving after the invalidation must not join the stale flight.
    const late = getLinkByCode('race')
    release()

    expect((await early)?.originalUrl).toBe('https://before.test')
    expect((await late)?.originalUrl).toBe('https://after.test')
    expect((await getLinkByCode('race'))?.originalUrl).toBe('https://after.test')
    expect(getLinkCacheStats().staleLoadsDiscarded).toBe(1)
  })

  it('caps a revision entry at the next scheduled revision', async () => {
    const soon = new Date(Date.now() + 40)
    mock.destinationRevision.findFirst.mockImplementation(async ({ where }: { where: { effectiveAt: { lte?: Date; gt?: Date } } }) =>
      where.effectiveAt.gt ? { effectiveAt: soon } : { destinationUrl: 'https://current.test' })
    await getLatestRevision('u4')
    await getLatestRevision('u4')
    expect(mock.destinationRevision.findFirst).toHaveBeenCalledTimes(2)
    await new Promise((r) => setTimeout(r, 60))
    await getLatestRevision('u4')
    expect(mock.destinationRevision.findFirst).toHaveBeenCalledTimes(4)
  })

  it('batch-invalidates links and keeps the reverse indexes bounded', async () => {
    mock.url.findUnique.mockImplementation(async ({ where }: { where: { shortCode: string } }) => row(`id-${where.shortCode}`, where.shortCode))
    for (const code of ['a', 'b', 'c']) await getLinkByCode(code)
    expect(getLinkCacheStats().indexedLinks).toBe(3)
    await invalidateLinks([{ id: 'id-a', shortCode: 'a' }, { id: 'id-b', shortCode: 'b' }])
    expect(getLinkCacheStats()).toMatchObject({ size: 1, indexedLinks: 1 })
    await invalidateLinks([])
  })
})

describe('cross-instance invalidation bus', () => {
  afterEach(() => {
    __setBusTransportForTests(null)
    __resetLinkCacheForTests()
  })

  it('publishes local invalidations and applies remote ones', async () => {
    const bus = fakeTransport()
    __setBusTransportForTests(bus.transport)
    __resetLinkCacheForTests()
    vi.clearAllMocks()
    mock.url.findUnique.mockImplementation(async () => row('u5', 'shared'))
    await getLinkByCode('shared')
    await tick()

    await invalidateLink('shared', 'u5')
    expect(bus.published.map((m) => JSON.parse(m))).toEqual([{ v: 1, origin: instanceId, codes: ['shared'], ids: ['u5'] }])

    await getLinkByCode('shared')
    await getLinkByCode('shared')
    expect(mock.url.findUnique).toHaveBeenCalledTimes(2)
    bus.deliver(JSON.stringify({ v: 1, origin: 'other-instance', ids: ['u5'] }))
    await getLinkByCode('shared')
    expect(mock.url.findUnique).toHaveBeenCalledTimes(3)
    expect(getLinkCacheStats().remoteInvalidations).toBe(1)
  })

  it('uses the long TTL only while subscribed and flushes when the subscription drops', async () => {
    const bus = fakeTransport()
    __setBusTransportForTests(bus.transport)
    __resetLinkCacheForTests()
    vi.clearAllMocks()
    mock.url.findUnique.mockImplementation(async () => row('u6', 'ttl'))
    await getLinkByCode('warm')
    await tick()
    expect(getLinkCacheStats().ttlMs).toBe(60_000)
    await getLinkByCode('ttl')
    expect(getLinkCacheStats().size).toBeGreaterThan(0)

    bus.down()
    expect(getLinkCacheStats()).toMatchObject({ size: 0, ttlMs: 5_000 })
    await getLinkByCode('ttl')
    bus.up()
    expect(getLinkCacheStats().size).toBe(0)
  })

  it('ignores its own, malformed and unknown-version messages', () => {
    expect(decodeInvalidation(JSON.stringify({ v: 1, origin: instanceId, codes: ['a'] }))).toBeNull()
    expect(decodeInvalidation('not json')).toBeNull()
    expect(decodeInvalidation(JSON.stringify({ v: 2, origin: 'x', codes: ['a'] }))).toBeNull()
    expect(decodeInvalidation(JSON.stringify({ v: 1, origin: 'x', codes: [] }))).toBeNull()
    expect(decodeInvalidation(JSON.stringify({ v: 1, origin: 'x', codes: [42, 'ok', 'ok'] }))).toEqual({ codes: ['ok'], ids: [], hosts: [] })
    expect(decodeInvalidation(JSON.stringify({ v: 1, origin: 'x', all: true }))).toEqual({ all: true })
  })

  it('splits large bulk invalidations into bounded messages', () => {
    const ids = Array.from({ length: MAX_KEYS_PER_MESSAGE + 10 }, (_, i) => `id${i}`)
    const messages = encodeInvalidation({ ids, codes: ['c'] }, 'me')
    expect(messages).toHaveLength(2)
    const decoded = messages.map((m) => decodeInvalidation(m, 'someone-else')!)
    expect(decoded.flatMap((d) => d.ids ?? [])).toEqual(ids)
    expect(decoded.flatMap((d) => d.codes ?? [])).toEqual(['c'])
    expect(encodeInvalidation({ codes: [] })).toEqual([])
  })

  it('counts failed publishes without throwing', async () => {
    __setBusTransportForTests({ publish: async () => { throw new Error('down') }, subscribe: async () => null })
    await expect(invalidateLink('x')).resolves.toBeUndefined()
    const { getLinkCacheStats: stats } = await import('./link-cache')
    expect(stats().bus.publishFailures).toBe(1)
  })
})
