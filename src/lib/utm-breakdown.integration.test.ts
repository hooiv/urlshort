import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: utm breakdown', () => {
  it.skipIf(!databaseUrl)('groups human clicks by dimension within the window', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getUtmBreakdown } = await import('./utm-breakdown')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const workspace = await db.workspace.create({ data: { name: tag, slug: `u-${tag}` } })
    try {
      const url = await db.url.create({ data: { shortCode: `u${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: workspace.id } })
      const now = new Date('2026-10-12T12:00:00Z')
      const at = (utmSource: string | null, utmMedium: string | null, iso = '2026-10-11T10:00:00Z', trafficType: 'human' | 'bot' = 'human') =>
        ({ urlId: url.id, utmSource, utmMedium, createdAt: new Date(iso), trafficType })
      await db.clickEvent.createMany({ data: [
        at('twitter', 'social'), at('twitter', 'social'), at('email', 'newsletter'), at(null, null),
        at('twitter', 'social', '2026-10-11T10:00:00Z', 'bot'), at('old', 'social', '2026-08-01T00:00:00Z'),
      ] })
      const src = await getUtmBreakdown(url.id, 'source', 30, 10, now)
      expect(src.total).toBe(4)
      expect(src.rows.map((r) => [r.value, r.clicks])).toEqual([['twitter', 2], ['(none)', 1], ['email', 1]].sort((a, b) => (b[1] as number) - (a[1] as number) || String(a[0]).localeCompare(String(b[0]))))
      const med = await getUtmBreakdown(url.id, 'medium', 30, 1, now)
      expect(med.rows[0]).toMatchObject({ value: 'social', clicks: 2 })
      expect(med.otherClicks).toBe(2)
    } finally {
      await db.url.deleteMany({ where: { shortCode: { contains: tag } } })
      await db.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined)
      await db.$disconnect()
    }
  }, 60_000)
})
