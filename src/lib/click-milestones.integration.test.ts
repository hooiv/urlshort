import { describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: click milestones', () => {
  it.skipIf(!databaseUrl)('alerts opted-in owners once per milestone and retries failed sends', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const sent: Array<{ to: string; subject: string }> = []
    let fail = false
    vi.doMock('./email', () => ({ sendEmail: async (m: { to: string; subject: string }) => (fail ? false : (sent.push(m), true)) }))
    const { sendMilestoneAlerts } = await import('./click-milestones')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()
    const on = await db.user.create({ data: { email: `ms-on-${tag}@example.com`, password: 'x', milestoneAlerts: true, emailVerifiedAt: now } })
    const off = await db.user.create({ data: { email: `ms-off-${tag}@example.com`, password: 'x', emailVerifiedAt: now } })
    const mk = (n: string, userId: string, clicks: number) => db.url.create({ data: { shortCode: `ms${n}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId, clicks } })
    const hit = await mk('a', on.id, 1500)
    const quiet = await mk('b', on.id, 50)
    const optedOut = await mk('c', off.id, 5000)
    const mine = () => sent.filter((m) => m.to === on.email)
    try {
      fail = true
      const failed = await sendMilestoneAlerts('https://q.l')
      expect(failed.failed).toBeGreaterThanOrEqual(1)
      expect((await db.url.findUnique({ where: { id: hit.id } }))?.milestoneReached).toBe(0)
      fail = false
      await sendMilestoneAlerts('https://q.l')
      expect(mine()).toHaveLength(1)
      expect((await db.url.findUnique({ where: { id: hit.id } }))?.milestoneReached).toBe(1000)
      await sendMilestoneAlerts('https://q.l')
      expect(mine()).toHaveLength(1)
      await db.url.update({ where: { id: hit.id }, data: { clicks: 10_400 } })
      await sendMilestoneAlerts('https://q.l')
      expect(mine()).toHaveLength(2)
      expect((await db.url.findUnique({ where: { id: quiet.id } }))?.milestoneReached).toBe(0)
      expect((await db.url.findUnique({ where: { id: optedOut.id } }))?.milestoneReached).toBe(0)
      expect(sent.some((m) => m.to === off.email)).toBe(false)
    } finally {
      await db.url.deleteMany({ where: { userId: { in: [on.id, off.id] } } })
      await db.user.deleteMany({ where: { id: { in: [on.id, off.id] } } })
      await db.$disconnect()
    }
  })
})
