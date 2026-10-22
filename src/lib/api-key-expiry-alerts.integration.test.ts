import { describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: api key expiry warnings', () => {
  it.skipIf(!databaseUrl)('warns once per key, skips far/revoked/expired, retries failed sends', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const sent: Array<{ to: string; subject: string }> = []
    let fail = false
    vi.doMock('./email', () => ({ sendEmail: async (m: { to: string; subject: string }) => (fail ? false : (sent.push(m), true)) }))
    const { sendApiKeyExpiryWarnings } = await import('./api-key-expiry-alerts')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()
    const day = 86_400_000
    const user = await db.user.create({ data: { email: `ak-${tag}@example.com`, password: 'x', emailVerifiedAt: now } })
    const mk = (n: string, extra: object) => db.apiKey.create({ data: { userId: user.id, name: n, keyHash: `h-${n}-${tag}`, prefix: `p${n}`, ...extra } })
    const soon = await mk('soon', { expiresAt: new Date(now.getTime() + 3 * day) })
    const far = await mk('far', { expiresAt: new Date(now.getTime() + 60 * day) })
    const revoked = await mk('rev', { expiresAt: new Date(now.getTime() + 3 * day), revokedAt: now })
    const expired = await mk('exp', { expiresAt: new Date(now.getTime() - day) })
    const mine = () => sent.filter((m) => m.to === user.email)
    try {
      fail = true
      expect((await sendApiKeyExpiryWarnings('https://q.l')).failed).toBeGreaterThanOrEqual(1)
      expect((await db.apiKey.findUnique({ where: { id: soon.id } }))?.expiryWarnedAt).toBeNull()
      fail = false
      await sendApiKeyExpiryWarnings('https://q.l')
      expect(mine()).toHaveLength(1)
      expect((await db.apiKey.findUnique({ where: { id: soon.id } }))?.expiryWarnedAt).not.toBeNull()
      await sendApiKeyExpiryWarnings('https://q.l')
      expect(mine()).toHaveLength(1)
      for (const k of [far, revoked, expired]) expect((await db.apiKey.findUnique({ where: { id: k.id } }))?.expiryWarnedAt).toBeNull()
    } finally {
      await db.apiKey.deleteMany({ where: { userId: user.id } })
      await db.user.delete({ where: { id: user.id } })
      await db.$disconnect()
    }
  })
})
