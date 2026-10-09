import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres checks for the delivery log. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: webhook delivery log', () => {
  it.skipIf(!databaseUrl)('paginates without gaps, aggregates stats and replays failures once', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { listDeliveries, deliveryStats, replayFailedDeliveries } = await import('./webhook-delivery-log')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await db.user.create({ data: { email: `dl-${tag}@example.com`, password: 'x' } })
    try {
      const endpoint = await db.webhookEndpoint.create({ data: { userId: user.id, url: 'https://hooks.example.com/dl', secret: 's', events: ['link.clicked'] } })
      // Same createdAt for several rows: the id tiebreak must keep pages disjoint.
      const at = new Date(Date.now() - 60_000)
      const statuses = ['success', 'success', 'failed', 'failed', 'pending', 'success', 'failed'] as const
      await db.webhookDelivery.createMany({
        data: statuses.map((status, i) => ({ endpointId: endpoint.id, event: 'link.clicked', payload: JSON.stringify({ n: i }), status, latencyMs: (i + 1) * 100, createdAt: i < 4 ? at : new Date(at.getTime() + i * 1000) })),
      })

      const seen: string[] = []
      let cursor = null
      do {
        const page: Awaited<ReturnType<typeof listDeliveries>> = await listDeliveries(endpoint.id, { cursor, limit: 2 })
        seen.push(...page.deliveries.map((d) => d.id))
        cursor = page.nextCursor ? (await import('./webhook-delivery-log')).decodeDeliveryCursor(page.nextCursor) : null
      } while (cursor)
      expect(seen).toHaveLength(7)
      expect(new Set(seen).size).toBe(7)
      expect((await listDeliveries(endpoint.id, { status: 'failed' })).deliveries).toHaveLength(3)

      const stats = await deliveryStats(endpoint.id, new Date(Date.now() - 3600_000))
      expect(stats).toMatchObject({ total: 7, success: 3, failed: 3, pending: 1, successRate: 50, p50LatencyMs: 400 })
      expect(stats.p95LatencyMs).toBe(670)

      expect(await replayFailedDeliveries({ id: endpoint.id, workspaceId: null }, new Date(Date.now() - 3600_000))).toEqual({ queued: 3, quotaExceeded: false })
      // Pressing it again doesn't double-send.
      expect(await replayFailedDeliveries({ id: endpoint.id, workspaceId: null }, new Date(Date.now() - 3600_000))).toEqual({ queued: 0, quotaExceeded: false })
      const replays = await db.webhookDelivery.findMany({ where: { endpointId: endpoint.id, replayOfId: { not: null } } })
      expect(replays).toHaveLength(3)
      expect(replays.every((r) => r.status === 'pending' && r.nextAttemptAt)).toBe(true)
    } finally {
      await db.user.delete({ where: { id: user.id } }).catch(() => {})
      await db.$disconnect()
    }
  })
})
