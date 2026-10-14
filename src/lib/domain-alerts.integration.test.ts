import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: domain alerts', () => {
  it.skipIf(!databaseUrl)('collects failing and soon-expiring domains per owner, skips healthy ones', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { collectDomainAlerts } = await import('./domain-alerts')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()
    const user = await db.user.create({ data: { email: `da-${tag}@example.com`, password: 'x' } })
    const url = await db.url.create({ data: { shortCode: `da${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: user.id } })
    const mk = (n: string, extra: object) => db.brandedDomain.create({ data: { host: `${n}-${tag}.example.com`, verificationToken: `t-${n}-${tag}`, ownerUrlId: url.id, status: 'verified', ...extra } })
    try {
      await mk('fail', { tlsStatus: 'failed' })
      await mk('soon', { tlsStatus: 'active', tlsCertificateExpiresAt: new Date(now.getTime() + 20 * 3_600_000) })
      await mk('fine', { tlsStatus: 'active', tlsCertificateExpiresAt: new Date(now.getTime() + 60 * 86_400_000) })
      const mine = (await collectDomainAlerts(now)).find((o) => o.email === user.email)
      expect(mine?.alerts.map((a) => [a.host.split('-')[0], a.reason.kind]).sort()).toEqual([['fail', 'failed'], ['soon', 'expiring']])
    } finally {
      await db.brandedDomain.deleteMany({ where: { ownerUrlId: url.id } })
      await db.url.deleteMany({ where: { userId: user.id } })
      await db.user.deleteMany({ where: { id: user.id } })
      await db.$disconnect()
    }
  }, 30_000)
})
