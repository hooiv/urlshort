import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/**
 * Real-Postgres checks for redirect-cache invalidation. Opt-in via
 * SOAK_DATABASE_URL. Each scenario mutates rows directly (as a management
 * route would) and asserts the redirect read path sees the change exactly
 * when the matching invalidation runs, never earlier from a stale load and
 * never later than a scheduled revision.
 */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: redirect cache invalidation', () => {
  it.skipIf(!databaseUrl)('keeps short-code, domain-path and revision entries coherent with Postgres', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const cacheModule = await import('./link-cache')
    const { getLinkByCode, getLinkByDomainPath, getLatestRevision, invalidateLink, invalidateDomain, invalidateLinks, __resetLinkCacheForTests } = cacheModule
    __resetLinkCacheForTests()
    const tag = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`
    const host = `go-${tag}.example.com`
    const code = `lc${tag}`
    const fresh = `ln${tag}`
    const link = await db.url.create({ data: { shortCode: code, originalUrl: 'https://old.example.com', revisions: { create: { destinationUrl: 'https://old.example.com', reason: 'Initial destination', effectiveAt: new Date(Date.now() - 1_000) } } } })
    const domain = await db.brandedDomain.create({ data: { host, verificationToken: `tok-${tag}`, status: 'pending' } })
    try {
      // A pending domain resolves nothing (negative entry) until verified.
      await db.domainLink.create({ data: { domainId: domain.id, urlId: link.id, path: '/launch' } })
      expect(await getLinkByDomainPath(host, '/launch')).toBeNull()
      await db.brandedDomain.update({ where: { id: domain.id }, data: { status: 'verified' } })
      expect(await getLinkByDomainPath(host, '/launch')).toBeNull()
      await invalidateDomain(host)
      expect((await getLinkByDomainPath(host, '/launch'))?.id).toBe(link.id)

      // Blocking/disabling through the short code also evicts the domain path.
      expect((await getLinkByCode(code))?.isActive).toBe(true)
      await db.url.update({ where: { id: link.id }, data: { isActive: false, riskStatus: 'blocked' } })
      expect((await getLinkByDomainPath(host, '/launch'))?.isActive).toBe(true)
      await invalidateLink(code, link.id)
      expect(await getLinkByDomainPath(host, '/launch')).toMatchObject({ isActive: false, riskStatus: 'blocked' })
      expect(await getLinkByCode(code)).toMatchObject({ isActive: false, riskStatus: 'blocked' })

      // A code probed before it exists works on its first click after creation.
      expect(await getLinkByCode(fresh)).toBeNull()
      const created = await db.url.create({ data: { shortCode: fresh, originalUrl: 'https://fresh.example.com' } })
      expect(await getLinkByCode(fresh)).toBeNull()
      await invalidateLinks([created])
      expect((await getLinkByCode(fresh))?.originalUrl).toBe('https://fresh.example.com')

      // A scheduled revision takes effect at its effectiveAt without any invalidation.
      expect((await getLatestRevision(link.id))?.destinationUrl).toBe('https://old.example.com')
      await db.destinationRevision.create({ data: { urlId: link.id, destinationUrl: 'https://scheduled.example.com', reason: 'Scheduled', effectiveAt: new Date(Date.now() + 1_200) } })
      await invalidateLink(code, link.id)
      expect((await getLatestRevision(link.id))?.destinationUrl).toBe('https://old.example.com')
      await new Promise((r) => setTimeout(r, 1_400))
      expect((await getLatestRevision(link.id))?.destinationUrl).toBe('https://scheduled.example.com')

      // Concurrent readers during an update: the read that started before the
      // write is never cached once the write's invalidation has run.
      const readers = Array.from({ length: 20 }, () => getLinkByCode(code))
      await db.url.update({ where: { id: link.id }, data: { originalUrl: 'https://after.example.com', isActive: true, riskStatus: 'cleared' } })
      await invalidateLink(code, link.id)
      await Promise.all(readers)
      expect((await getLinkByCode(code))?.originalUrl).toBe('https://after.example.com')
      expect((await getLinkByDomainPath(host, '/launch'))?.originalUrl).toBe('https://after.example.com')

      // Deletion resolves to nothing everywhere.
      await db.url.update({ where: { id: link.id }, data: { deletedAt: new Date() } })
      await invalidateLink(code, link.id)
      expect(await getLinkByCode(code)).toBeNull()
      expect(await getLinkByDomainPath(host, '/launch')).toBeNull()
    } finally {
      await db.brandedDomain.delete({ where: { id: domain.id } }).catch(() => {})
      await db.url.deleteMany({ where: { shortCode: { in: [code, fresh] } } })
      await db.$disconnect()
    }
  }, 20_000)
})
