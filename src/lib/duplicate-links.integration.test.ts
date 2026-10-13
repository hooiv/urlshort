import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: duplicate links', () => {
  it.skipIf(!databaseUrl)('finds active duplicates inside one workspace only', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { findDuplicateLinks } = await import('./duplicate-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `dup-${tag}` } })
    const other = await db.workspace.create({ data: { name: `o${tag}`, slug: `dupo-${tag}` } })
    try {
      const mk = (code: string, url: string, workspaceId: string, extra: object = {}) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: url, workspaceId, ...extra } })
      const a = await mk('a', 'https://Example.com/page/', ws.id, { clicks: 2 })
      const b = await mk('b', 'https://www.example.com/page?utm_source=x', ws.id, { clicks: 10 })
      await mk('c', 'https://example.com/page', ws.id, { isActive: false })
      await mk('d', 'https://example.com/page', other.id)
      await mk('e', 'https://example.com/unique', ws.id)
      const res = await findDuplicateLinks({ kind: 'workspace', workspaceId: ws.id }, 10)
      expect(res.groups).toHaveLength(1)
      expect(res.groups[0]).toMatchObject({ destination: 'example.com/page', count: 2, totalClicks: 12, keep: b.id })
      expect(res.groups[0].links.map((l) => l.id).sort()).toEqual([a.id, b.id].sort())
    } finally {
      await db.url.deleteMany({ where: { shortCode: { contains: tag } } })
      await db.workspace.deleteMany({ where: { id: { in: [ws.id, other.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
