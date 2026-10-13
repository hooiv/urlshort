import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: links export', () => {
  it.skipIf(!databaseUrl)('exports one workspace, skips trashed links, hides password hashes', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { exportLinks } = await import('./links-export')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `exp-${tag}` } })
    const other = await db.workspace.create({ data: { name: `o${tag}`, slug: `expo-${tag}` } })
    try {
      const mk = (code: string, workspaceId: string, extra: object = {}) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com/' + code, workspaceId, ...extra } })
      await mk('a', ws.id, { tags: ['x'], passwordHash: 'secret-hash' })
      await mk('b', ws.id, { deletedAt: new Date() })
      await mk('c', other.id)
      const res = await exportLinks({ kind: 'workspace', workspaceId: ws.id })
      expect(res.links).toHaveLength(1)
      expect(res.links[0]).toMatchObject({ tags: ['x'], passwordProtected: true })
      expect(JSON.stringify(res)).not.toContain('secret-hash')
    } finally {
      await db.url.deleteMany({ where: { shortCode: { contains: tag } } })
      await db.workspace.deleteMany({ where: { id: { in: [ws.id, other.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
