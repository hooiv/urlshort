import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: link clone', () => {
  it.skipIf(!databaseUrl)('copies link and rules, resets counters, rejects taken codes', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { cloneLink, CodeTakenError } = await import('./link-clone')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await db.user.create({ data: { email: `c-${tag}@example.com`, password: 'x' } })
    try {
      const src = await db.url.create({ data: { shortCode: `src${tag}`.slice(0, 40), originalUrl: 'https://example.com/x', userId: user.id, clicks: 50, passwordHash: 'p', tags: ['x'], maxClicks: 5 } })
      await db.linkRule.createMany({ data: [
        { urlId: src.id, name: 'US', destinationUrl: 'https://example.com/us', countryCodes: 'US', priority: 1 },
        { urlId: src.id, name: 'Mobile', destinationUrl: 'https://example.com/m', deviceType: 'mobile', weight: 40 },
      ] })
      const code = `cp${tag}`.slice(0, 40)
      const clone = await cloneLink(src, code, user.id)
      expect(clone.rulesCopied).toBe(2)
      const row = await db.url.findUniqueOrThrow({ where: { id: clone.id }, include: { rules: true } })
      expect(row).toMatchObject({ shortCode: code, originalUrl: src.originalUrl, clicks: 0, passwordHash: null, tags: ['x'], maxClicks: 5, userId: user.id })
      expect(row.rules.map((r) => r.name).sort()).toEqual(['Mobile', 'US'])
      expect(row.rules.every((r) => r.urlId === clone.id)).toBe(true)
      await expect(cloneLink(src, code, user.id)).rejects.toBeInstanceOf(CodeTakenError)
      const auto = await cloneLink(src, null, user.id)
      expect(auto.shortCode).toHaveLength(7)
    } finally {
      await db.url.deleteMany({ where: { userId: user.id } })
      await db.user.deleteMany({ where: { id: user.id } })
      await db.$disconnect()
    }
  }, 30_000)
})
