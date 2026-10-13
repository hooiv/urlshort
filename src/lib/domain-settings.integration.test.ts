import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: domain fallbacks', () => {
  it.skipIf(!databaseUrl)('stores fallbacks and only exposes them for verified domains', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getDomainFallbacks, updateDomainFallbacks } = await import('./domain-settings')
    const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    const host = `go${tag}.example.com`
    const domain = await db.brandedDomain.create({ data: { host, verificationToken: `t${tag}`, status: 'pending' } })
    try {
      await updateDomainFallbacks(domain.id, { rootRedirectUrl: 'https://acme.com/', notFoundUrl: 'https://acme.com/404' })
      expect(await getDomainFallbacks(host)).toBeNull()
      await db.brandedDomain.update({ where: { id: domain.id }, data: { status: 'verified' } })
      expect(await getDomainFallbacks(host)).toMatchObject({ rootRedirectUrl: 'https://acme.com/', notFoundUrl: 'https://acme.com/404' })
      await updateDomainFallbacks(domain.id, { notFoundUrl: null })
      expect((await getDomainFallbacks(host))?.notFoundUrl).toBeNull()
    } finally {
      await db.brandedDomain.delete({ where: { id: domain.id } })
      await db.$disconnect()
    }
  }, 30_000)
})
