import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: webhook auto-disable', () => {
  it.skipIf(!databaseUrl)('disables once after a sustained failure streak', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { evaluateEndpointHealth } = await import('./webhook-health')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await db.user.create({ data: { email: `wh-${tag}@example.com`, password: 'x' } })
    try {
      const ep = await db.webhookEndpoint.create({ data: { userId: user.id, url: 'https://hooks.example.com/h', secret: 's', events: ['link.clicked'] } })
      const rows = (n: number, spanH: number) => Array.from({ length: n }, (_, i) => ({ endpointId: ep.id, event: 'link.clicked', payload: '{}', status: 'failed' as const, createdAt: new Date(Date.now() - (spanH * 3600_000 * i) / (n - 1)) }))
      await db.webhookDelivery.createMany({ data: rows(10, 2) })
      expect(await evaluateEndpointHealth(ep.id)).toBe(false)
      await db.webhookDelivery.deleteMany({ where: { endpointId: ep.id } })
      await db.webhookDelivery.createMany({ data: rows(10, 30) })
      expect(await evaluateEndpointHealth(ep.id)).toBe(true)
      expect(await evaluateEndpointHealth(ep.id)).toBe(false)
      const after = await db.webhookEndpoint.findUniqueOrThrow({ where: { id: ep.id } })
      expect(after.isActive).toBe(false)
      expect(after.disabledAt).not.toBeNull()
    } finally {
      await db.user.delete({ where: { id: user.id } }).catch(() => {})
      await db.$disconnect()
    }
  })
})
