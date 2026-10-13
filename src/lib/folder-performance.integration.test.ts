import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: folder performance', () => {
  it.skipIf(!databaseUrl)('aggregates per folder, includes unfiled, hides restricted folders from viewers', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getFolderPerformance } = await import('./folder-performance')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `fp-${tag}` } })
    const viewer = await db.user.create({ data: { email: `fp-${tag}@example.com`, password: 'x' } })
    const now = new Date()
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
    try {
      const open = await db.folder.create({ data: { workspaceId: ws.id, name: 'Open' } })
      const secret = await db.folder.create({ data: { workspaceId: ws.id, name: 'Secret', restricted: true } })
      const mk = (code: string, folderId: string | null) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, folderId } })
      const a = await mk('a', open.id)
      const b = await mk('b', secret.id)
      const c = await mk('c', null)
      await db.clickEvent.createMany({ data: [
        { urlId: a.id, trafficType: 'human', createdAt: ago(1) },
        { urlId: a.id, trafficType: 'human', createdAt: ago(2) },
        { urlId: a.id, trafficType: 'human', createdAt: ago(10) },
        { urlId: a.id, trafficType: 'bot', createdAt: ago(1) },
        { urlId: b.id, trafficType: 'human', createdAt: ago(1) },
        { urlId: c.id, trafficType: 'human', createdAt: ago(3) },
      ] })
      const admin = await getFolderPerformance(ws.id, undefined, 7, now)
      expect(admin.folders.find((f) => f.name === 'Open')).toMatchObject({ links: 1, clicks: 2, previousClicks: 1, changePct: 100 })
      expect(admin.folders.find((f) => f.name === 'Secret')?.clicks).toBe(1)
      expect(admin.folders.find((f) => f.folderId === null)).toMatchObject({ name: 'Unfiled', clicks: 1 })
      const limited = await getFolderPerformance(ws.id, { userId: viewer.id }, 7, now)
      expect(limited.folders.map((f) => f.name).sort()).toEqual(['Open', 'Unfiled'])
    } finally {
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.deleteMany({ where: { id: ws.id } })
      await db.user.deleteMany({ where: { id: viewer.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
