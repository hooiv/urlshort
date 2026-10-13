import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: link rename', () => {
  it.skipIf(!databaseUrl)('renames, frees the old code, rejects collisions', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { renameLink, RenameConflictError } = await import('./link-rename')
    const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    const a = await db.url.create({ data: { shortCode: `ra${tag}`, originalUrl: 'https://example.com/a', clicks: 7 } })
    const b = await db.url.create({ data: { shortCode: `rb${tag}`, originalUrl: 'https://example.com/b' } })
    try {
      const out = await renameLink(a.id, `rn${tag}`)
      expect(out.shortCode).toBe(`rn${tag}`)
      expect(await db.url.findUnique({ where: { shortCode: `ra${tag}` } })).toBeNull()
      expect((await db.url.findUniqueOrThrow({ where: { id: a.id } })).clicks).toBe(7)
      await expect(renameLink(b.id, `rn${tag}`)).rejects.toBeInstanceOf(RenameConflictError)
    } finally {
      await db.url.deleteMany({ where: { id: { in: [a.id, b.id] } } })
      await db.$disconnect()
    }
  }, 30_000)
})
