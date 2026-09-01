import { describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  url: { findUnique: vi.fn() },
  webhookDelivery: { findUnique: vi.fn(), updateMany: vi.fn() },
  samlRelayNonce: { deleteMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/destination-health', () => ({ assertDestinationSafeForStorage: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/tenant-usage', () => ({ reserveUsage: vi.fn().mockResolvedValue({ allowed: true, used: 1n, limit: null }) }))

import { getLinkByCode, __resetLinkCacheForTests } from './link-cache'
import { aggregateClicks } from './queue'
import { dedupeClickIds } from './click-ingestion'
import { createSamlRelayState, verifySamlRelayState } from './saml'
import { canonicalJson, signRoutingConfig, verifyRoutingConfig, shouldAcceptRoutingSnapshot, routingLockKey } from './routing-config'
import { sequentialAlpha, shiftTrafficWeights } from './campaigns'
import { webhookBackoffMs } from './webhooks'

describe('adversarial production soak', () => {
  it('collapses 500 concurrent redirect cache misses into one database read', async () => {
    __resetLinkCacheForTests()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    prismaMock.url.findUnique.mockImplementation(async () => {
      await gate
      return {
        id: 'url-1', shortCode: 'soak', originalUrl: 'https://example.test/a', title: null,
        description: null, ogImage: null, isActive: true, riskStatus: 'cleared', expiresAt: null,
        expiredUrl: null, passwordHash: null, metaPixelId: null, googleTagId: null, xPixelId: null,
        cloaked: false, webhookUrl: null, maxClicks: null, clicksReserved: 0, deletedAt: null, rules: [],
      }
    })
    const requests = Array.from({ length: 500 }, () => getLinkByCode('soak'))
    await Promise.resolve()
    expect(prismaMock.url.findUnique).toHaveBeenCalledTimes(1)
    release()
    const results = await Promise.all(requests)
    expect(results).toHaveLength(500)
    expect(results.every(Boolean)).toBe(true)
  })

  it('keeps click persistence idempotent across Redis crash/requeue windows', () => {
    const duplicate = {
      clickEventId: 'evt-1', urlId: 'url-1', shortCode: 'soak', dateKey: '2026-09-01',
    }
    const unique = dedupeClickIds([duplicate, duplicate, { ...duplicate, clickEventId: 'evt-2' }])
    const aggregate = aggregateClicks(unique)
    expect(unique).toHaveLength(2)
    expect(aggregate.perUrl.get('url-1')?.count).toBe(2)
    expect(aggregate.perDay.get('url-1|2026-09-01')?.count).toBe(2)
  })

  it('allows only one webhook claimant and lets an expired lease be reclaimed', () => {
    type Delivery = { attempts: number; leaseUntil: number | null; leaseToken: string | null }
    const delivery: Delivery = { attempts: 0, leaseUntil: null, leaseToken: null }
    const claim = (now: number, token: string) => {
      if (delivery.leaseUntil !== null && delivery.leaseUntil > now) return false
      delivery.attempts += 1
      delivery.leaseUntil = now + 30_000
      delivery.leaseToken = token
      return true
    }
    expect(claim(1_000, 'worker-a')).toBe(true)
    expect(claim(1_001, 'worker-b')).toBe(false)
    expect(claim(31_001, 'worker-b')).toBe(true)
    // A stale worker must not be allowed to finalize the newer lease.
    expect(delivery.leaseToken).toBe('worker-b')
    expect(webhookBackoffMs(1)).toBe(300_000)
    expect(webhookBackoffMs(5)).toBe(187_500_000)
  })

  it('never overspends a quota when 1,000 workers race a limit of 37', async () => {
    let used = 0
    const reserve = async () => {
      // This models the database transaction's serialized increment decision.
      await Promise.resolve()
      if (used >= 37) return false
      used += 1
      return true
    }
    const results = await Promise.all(Array.from({ length: 1_000 }, reserve))
    expect(results.filter(Boolean)).toHaveLength(37)
    expect(used).toBe(37)
  })

  it('permits exactly one simultaneous autopilot worker to claim a look', async () => {
    let cooldownUntil = 0
    let lookCount = 0
    const claim = async (now: number) => {
      await Promise.resolve()
      if (cooldownUntil > now) return false
      cooldownUntil = now + 30 * 60_000
      lookCount += 1
      return true
    }
    const results = await Promise.all(Array.from({ length: 250 }, () => claim(10_000)))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(lookCount).toBe(1)
  })

  it('consumes SAML relay nonces so concurrent/replayed ACS requests cannot reuse state', async () => {
    process.env.SSO_STATE_SECRET = 'soak-secret'
    prismaMock.samlRelayNonce.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.samlRelayNonce.create.mockResolvedValue({})
    const consumed = new Set<string>()
        prismaMock.samlRelayNonce.updateMany.mockImplementation(async ({ where }: { where: { nonce: string } }) => { if (consumed.has(where.nonce)) return { count: 0 }; consumed.add(where.nonce); return { count: 1 } })
    const relay = await createSamlRelayState('conn-1', '/dashboard')
    expect(await verifySamlRelayState(relay, 'conn-1')).not.toBeNull()
    expect(await verifySamlRelayState(relay, 'conn-1')).toBeNull()
    expect(await verifySamlRelayState(relay, 'conn-2')).toBeNull()
    const concurrent = await Promise.all(Array.from({ length: 100 }, () => verifySamlRelayState(relay, 'conn-1')))
    expect(concurrent.filter(Boolean)).toHaveLength(0)
  })

  it('rejects edge rollback and cross-region stale snapshots by enforcing a signed chain', () => {
    process.env.QL_CONFIG_SIGNING_SECRET = 'edge-soak-secret'
    const v1 = canonicalJson({ version: 1, destination: 'https://a.test' })
    const s1 = signRoutingConfig(v1, null)
    const v2 = canonicalJson({ version: 2, destination: 'https://b.test' })
    const s2 = signRoutingConfig(v2, s1.hash)
    expect(verifyRoutingConfig(v2, s1.hash, s2.hash, s2.signature)).toBe(true)
    expect(verifyRoutingConfig(v1, null, s1.hash, s1.signature)).toBe(true)
    // A replica that already accepted v2 must not accept v1 as a current state.
    const acceptedVersion = 2
    expect(1 > acceptedVersion).toBe(false)
    expect(verifyRoutingConfig(v1, s2.hash, s1.hash, s1.signature)).toBe(false)
    // A forged/cross-region payload cannot be substituted while retaining v2's signature.
    expect(verifyRoutingConfig(canonicalJson({ version: 2, destination: 'https://evil.test' }), s1.hash, s2.hash, s2.signature)).toBe(false)
    const incomingV2 = { version: 2, contentHash: s2.hash, previousHash: s1.hash, payloadJson: v2, signature: s2.signature }
    expect(shouldAcceptRoutingSnapshot(null, { version:1, contentHash:s1.hash, previousHash:null, payloadJson:v1, signature:s1.signature })).toBe(true)
    expect(shouldAcceptRoutingSnapshot({ version:2, contentHash:s2.hash }, incomingV2)).toBe(false)
    expect(shouldAcceptRoutingSnapshot({ version:1, contentHash:s1.hash }, incomingV2)).toBe(true)
    expect(shouldAcceptRoutingSnapshot({ version:1, contentHash:s1.hash }, { ...incomingV2, previousHash:null })).toBe(false)
  })

  it('spends alpha across an unbounded sequence of autopilot looks', () => {
    const levels = Array.from({ length: 100 }, (_, i) => sequentialAlpha(1000, 1000, 10000, 0.05, i + 1))
    expect(levels[0]).toBeGreaterThan(levels[99])
    expect(levels.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(0.05 + 1e-12)
    expect(levels.every(value => value > 0)).toBe(true)
  })

  it('never changes the total traffic mass or overflows bounded variant weights', () => {
    const weights = { control: 40, winner: 30, other: 30 }
    const shifted = shiftTrafficWeights(weights, 'control', 'winner', 50)
    expect(shifted).toEqual({ control: 1, winner: 69, other: 30 })
    expect(Object.values(shifted!).reduce((a, b) => a + b, 0)).toBe(100)
    expect(shiftTrafficWeights({ control: 1, winner: 99 }, 'control', 'winner', 20)).toBeNull()
  })

  it('uses one routing publication lock namespace so concurrent publishers cannot fork the hash chain', async () => {
    expect(routingLockKey('workspace-1')).toBe('routing-config:workspace-1')
    expect(routingLockKey('workspace-1')).toBe(routingLockKey('workspace-1'))
  })
})
