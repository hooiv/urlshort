import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: visitor erasure', () => {
  it.skipIf(!databaseUrl)('deletes only the subject’s clicks inside the workspace', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { eraseVisitor } = await import('./visitor-erasure')
    const { hashWithWorkspace } = await import('./privacy-ingestion')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await db.user.create({ data: { email: `er-${tag}@example.com`, password: 'x' } })
    const [w1, w2] = await Promise.all([1, 2].map((i) => db.workspace.create({ data: { name: `${tag}${i}`, slug: `er${i}-${tag}`, members: { create: [{ userId: user.id, role: 'owner' }] } } })))
    try {
      const mk = (ws: string, n: string) => db.url.create({ data: { shortCode: `${n}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws } })
      const [u1, u2] = await Promise.all([mk(w1.id, 'a'), mk(w2.id, 'b')])
      const ip = '203.0.113.50'
      await db.clickEvent.createMany({ data: [
        { urlId: u1.id, ip },
        { urlId: u1.id, ip: hashWithWorkspace(ip, w1.id) },
        { urlId: u1.id, ip: '198.51.100.1' },
        { urlId: u2.id, ip },
      ] })
      expect(await eraseVisitor(w1.id, { ip }, { dryRun: true })).toMatchObject({ matched: 2, deleted: 0 })
      expect(await eraseVisitor(w1.id, { ip })).toMatchObject({ matched: 2, deleted: 2 })
      expect(await db.clickEvent.count({ where: { urlId: u1.id } })).toBe(1)
      expect(await db.clickEvent.count({ where: { urlId: u2.id } })).toBe(1)
    } finally {
      await db.workspace.deleteMany({ where: { id: { in: [w1.id, w2.id] } } })
      await db.user.delete({ where: { id: user.id } })
      await db.$disconnect()
    }
  })
})
