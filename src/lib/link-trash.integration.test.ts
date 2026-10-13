import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: link trash', () => {
  it.skipIf(!databaseUrl)('trashes, lists, restores and purges only expired links', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { trashLink, restoreLink, listTrash, purgeExpiredTrash, restoreAllTrash, emptyTrash } = await import('./link-trash')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await db.user.create({ data: { email: `t-${tag}@example.com`, password: 'x' } })
    const other = await db.user.create({ data: { email: `o-${tag}@example.com`, password: 'x' } })
    try {
      const mk = (c: string) => db.url.create({ data: { shortCode: `${c}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: user.id } })
      const [a, b, old] = await Promise.all([mk('a'), mk('b'), mk('o')])
      expect(await trashLink(a)).toBe(true)
      expect(await trashLink(a)).toBe(false)
      expect((await listTrash(user.id)).map((l) => l.id)).toEqual([a.id])
      expect(await listTrash(other.id)).toEqual([])
      expect(await restoreLink(a)).toBe(true)
      expect(await restoreLink(a)).toBe(false)
      expect(await listTrash(user.id)).toEqual([])

      const now = new Date()
      await db.url.update({ where: { id: old.id }, data: { deletedAt: new Date(now.getTime() - 31 * 86_400_000) } })
      await trashLink(b, now)
      expect(await restoreLink(old, now)).toBe(false)
      expect((await listTrash(user.id, now)).map((l) => l.id)).toEqual([b.id])
      expect(await purgeExpiredTrash(now)).toBeGreaterThanOrEqual(1)
      expect(await db.url.findUnique({ where: { id: old.id } })).toBeNull()
      expect(await db.url.findUnique({ where: { id: b.id } })).not.toBeNull()

      // bulk ops touch only the caller's own trash
      const [c, d] = await Promise.all([mk('c'), mk('d')])
      const theirs = await db.url.create({ data: { shortCode: `x${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: other.id } })
      await trashLink(c); await trashLink(d); await trashLink(theirs)
      expect(await restoreAllTrash(user.id)).toBe(3)
      expect((await listTrash(other.id)).map((l) => l.id)).toEqual([theirs.id])
      await trashLink(c)
      expect(await emptyTrash(user.id)).toBe(1)
      expect(await db.url.findUnique({ where: { id: c.id } })).toBeNull()
      expect(await db.url.findUnique({ where: { id: d.id } })).not.toBeNull()
      expect(await db.url.findUnique({ where: { id: theirs.id } })).not.toBeNull()
    } finally {
      await db.url.deleteMany({ where: { userId: { in: [user.id, other.id] } } })
      await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } })
      await db.$disconnect()
    }
  }, 30_000)
})
