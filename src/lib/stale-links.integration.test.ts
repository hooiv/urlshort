import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: stale links', () => {
  it.skipIf(!databaseUrl)('flags idle and never-clicked links, skips fresh, active-clicked, bot-only-clicked handled', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getStaleLinks } = await import('./stale-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `st-${tag}` } })
    const now = new Date('2026-10-13T00:00:00Z')
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
    try {
      const mk = (code: string, createdAt: Date, extra: object = {}) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, createdAt, ...extra } })
      const idle = await mk('idle', ago(200))
      const never = await mk('nev', ago(150))
      const fresh = await mk('new', ago(10))
      const active = await mk('act', ago(200))
      const archived = await mk('arc', ago(200), { isActive: false })
      const botOnly = await mk('bot', ago(200))
      await db.clickEvent.createMany({ data: [
        { urlId: idle.id, trafficType: 'human', createdAt: ago(120) },
        { urlId: active.id, trafficType: 'human', createdAt: ago(5) },
        { urlId: botOnly.id, trafficType: 'bot', createdAt: ago(1) },
      ] })
      const res = await getStaleLinks({ kind: 'workspace', workspaceId: ws.id }, { days: 90, limit: 10 }, now)
      const ids = res.links.map((l) => l.id)
      expect(ids).toContain(idle.id)
      expect(ids).toContain(never.id)
      expect(ids).toContain(botOnly.id)
      expect(ids).not.toContain(fresh.id)
      expect(ids).not.toContain(active.id)
      expect(ids).not.toContain(archived.id)
      expect(res.links.find((l) => l.id === idle.id)).toMatchObject({ idleDays: 120, totalClicks: 1 })
      const limited = await getStaleLinks({ kind: 'workspace', workspaceId: ws.id }, { days: 90, limit: 1 }, now)
      expect(limited.truncated).toBe(true)
      expect(limited.links).toHaveLength(1)
    } finally {
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.deleteMany({ where: { id: ws.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
