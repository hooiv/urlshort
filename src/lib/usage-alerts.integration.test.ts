import { describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL
const sent: { to: string; subject: string }[] = []
vi.mock('@/lib/email', () => ({ sendEmail: async (m: { to: string; subject: string }) => { sent.push(m); return true } }))

describe('real database: usage alerts', () => {
  it.skipIf(!databaseUrl)('emails owners once per threshold per month', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { sendUsageAlerts } = await import('./usage-alerts')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()
    const periodKey = now.toISOString().slice(0, 7)
    const owner = await db.user.create({ data: { email: `ua-o-${tag}@example.com`, password: 'x' } })
    const viewer = await db.user.create({ data: { email: `ua-v-${tag}@example.com`, password: 'x' } })
    const ws = await db.workspace.create({ data: { name: `UA ${tag}`, slug: `ua-${tag}`, tenantQuota: { create: { clicksPerMonth: 1000 } } } })
    await db.membership.createMany({ data: [{ workspaceId: ws.id, userId: owner.id, role: 'owner' }, { workspaceId: ws.id, userId: viewer.id, role: 'viewer' }] })
    const bucket = (q: number) => db.usageBucket.upsert({ where: { workspaceId_metric_periodKey: { workspaceId: ws.id, metric: 'clicks', periodKey } }, create: { workspaceId: ws.id, metric: 'clicks', periodKey, quantity: BigInt(q) }, update: { quantity: BigInt(q) } })
    const mine = () => sent.filter((m) => m.to.includes(tag))
    try {
      await bucket(500)
      await sendUsageAlerts('https://x.io', now)
      expect(mine()).toHaveLength(0)
      await bucket(850)
      await sendUsageAlerts('https://x.io', now)
      await sendUsageAlerts('https://x.io', now)
      expect(mine().map((m) => m.to)).toEqual([owner.email])
      expect(mine()[0].subject).toContain('80%')
      await bucket(1000)
      await sendUsageAlerts('https://x.io', now)
      await sendUsageAlerts('https://x.io', now)
      expect(mine()).toHaveLength(2)
      expect(mine()[1].subject).toContain('reached')
    } finally {
      await db.workspace.deleteMany({ where: { id: ws.id } })
      await db.user.deleteMany({ where: { id: { in: [owner.id, viewer.id] } } })
      await db.$disconnect()
    }
  }, 30_000)
})
