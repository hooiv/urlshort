import { describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: weekly digest', () => {
  it.skipIf(!databaseUrl)('sends once per week to opted-in verified users with activity', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const sent: Array<{ to: string; subject: string }> = []
    vi.doMock('./email', () => ({ sendEmail: async (m: { to: string; subject: string }) => (sent.push(m), true) }))
    const { sendWeeklyDigests, digestWindow } = await import('./weekly-digest')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()
    const window = digestWindow(now)
    const mkUser = (n: string, extra: Record<string, unknown>) => db.user.create({ data: { email: `wd-${n}-${tag}@example.com`, password: 'x', ...extra } })
    const on = await mkUser('on', { weeklyDigest: true, emailVerifiedAt: now })
    const off = await mkUser('off', { emailVerifiedAt: now })
    const unverified = await mkUser('unv', { weeklyDigest: true })
    const quiet = await mkUser('quiet', { weeklyDigest: true, emailVerifiedAt: now })
    const url = await db.url.create({ data: { shortCode: `wd${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: on.id } })
    try {
      await db.clickDaily.create({ data: { urlId: url.id, dateKey: window.to, clicks: 7 } })
      const first = await sendWeeklyDigests('https://q.l', now, 1000)
      const mine = sent.filter((m) => m.to.endsWith(`-${tag}@example.com`))
      expect(mine.map((m) => m.to)).toEqual([on.email])
      expect(mine[0].subject).toContain('7 clicks')
      expect(first.sent).toBeGreaterThanOrEqual(1)
      const second = await sendWeeklyDigests('https://q.l', new Date(now.getTime() + 3_600_000), 1000)
      expect(sent.filter((m) => m.to === on.email)).toHaveLength(1)
      expect(second.sent).toBe(0)
      const later = await sendWeeklyDigests('https://q.l', new Date(now.getTime() + 7 * 86_400_000), 1000)
      expect(later.sent).toBeGreaterThanOrEqual(1)
      expect(sent.filter((m) => m.to === on.email)).toHaveLength(2)
      expect((await db.user.findUnique({ where: { id: off.id } }))?.weeklyDigestSentAt).toBeNull()
      expect((await db.user.findUnique({ where: { id: unverified.id } }))?.weeklyDigestSentAt).toBeNull()
    } finally {
      await db.url.deleteMany({ where: { userId: on.id } })
      await db.user.deleteMany({ where: { id: { in: [on.id, off.id, unverified.id, quiet.id] } } })
      await db.$disconnect()
    }
  }, 30_000)
})
