import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: broken link alerts', () => {
  it.skipIf(!databaseUrl)('only confirmed, recent, active down links are collected', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { collectBrokenAlerts } = await import('./broken-link-alerts')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()
    const user = await db.user.create({ data: { email: `bl-${tag}@example.com`, password: 'x' } })
    const mk = (n: string, extra: object) => db.url.create({ data: { shortCode: `bl${n}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: user.id, healthStatus: 'down', healthConsecutiveFailures: 5, healthCheckedAt: now, ...extra } })
    try {
      await mk('ok', {})
      await mk('few', { healthConsecutiveFailures: 1 })
      await mk('old', { healthCheckedAt: new Date(now.getTime() - 5 * 86_400_000) })
      await mk('arch', { isActive: false })
      await mk('trash', { deletedAt: now })
      await mk('up', { healthStatus: 'healthy' })
      const mine = (await collectBrokenAlerts(now)).find((o) => o.email === user.email)
      expect(mine?.total).toBe(1)
      expect(mine?.links[0].shortCode.startsWith('blok')).toBe(true)
    } finally {
      await db.url.deleteMany({ where: { userId: user.id } })
      await db.user.deleteMany({ where: { id: user.id } })
      await db.$disconnect()
    }
  }, 30_000)
})
