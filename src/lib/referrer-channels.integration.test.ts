import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: referrer channels', () => {
  it.skipIf(!databaseUrl)('groups human clicks by classified referrer within the window', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getChannelBreakdown } = await import('./referrer-channels')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const workspace = await db.workspace.create({ data: { name: tag, slug: `rc-${tag}` } })
    try {
      const url = await db.url.create({ data: { shortCode: `rc${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: workspace.id } })
      const now = new Date('2026-10-12T12:00:00Z')
      const at = (referrerHost: string | null, iso = '2026-10-11T10:00:00Z', trafficType: 'human' | 'bot' = 'human') => ({ urlId: url.id, referrerHost, createdAt: new Date(iso), trafficType })
      await db.clickEvent.createMany({ data: [
        at('google.com'), at('google.com'), at('l.facebook.com'), at(null), at('mail.google.com'),
        at('google.com', '2026-10-11T10:00:00Z', 'bot'), at('google.com', '2026-07-01T10:00:00Z'),
      ] })
      const r = await getChannelBreakdown(url.id, 30, now)
      expect(r.total).toBe(5)
      expect(Object.fromEntries(r.channels.map((c) => [c.channel, c.clicks]))).toEqual({ search: 2, social: 1, direct: 1, email: 1 })
    } finally {
      await db.url.deleteMany({ where: { shortCode: { contains: tag } } })
      await db.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined)
      await db.$disconnect()
    }
  }, 60_000)
})
