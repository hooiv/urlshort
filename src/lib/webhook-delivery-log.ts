import { Prisma, type WebhookStatus } from '@prisma/client'
import { prisma } from './prisma'
import { reserveUsageInTransaction } from './tenant-usage'

/**
 * Delivery log for a webhook endpoint: keyset-paginated history, 24h health
 * stats, and manual redelivery. Replays create a new delivery (new
 * X-QuickLink-Delivery id, same body) linked by replayOfId, so the original
 * attempt history is never rewritten.
 */

export const DELIVERY_PAGE_MAX = 100
export const REPLAY_FAILED_MAX = 200

export type DeliveryCursor = { createdAt: Date; id: string }

export function encodeDeliveryCursor(cursor: DeliveryCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString('base64url')
}

export function decodeDeliveryCursor(raw: string | null | undefined): DeliveryCursor | null {
  if (!raw) return null
  try {
    const [iso, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|')
    const createdAt = new Date(iso)
    if (!id || Number.isNaN(createdAt.getTime()) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
    return { createdAt, id }
  } catch {
    return null
  }
}

const SUMMARY_SELECT = {
  id: true, event: true, status: true, responseCode: true, attempts: true, latencyMs: true,
  createdAt: true, lastAttemptAt: true, nextAttemptAt: true, replayOfId: true,
} as const

export async function listDeliveries(endpointId: string, options: { status?: WebhookStatus; cursor?: DeliveryCursor | null; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), DELIVERY_PAGE_MAX)
  const where: Prisma.WebhookDeliveryWhereInput = { endpointId, ...(options.status ? { status: options.status } : {}) }
  if (options.cursor) {
    where.OR = [
      { createdAt: { lt: options.cursor.createdAt } },
      { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } },
    ]
  }
  const rows = await prisma.webhookDelivery.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, select: SUMMARY_SELECT })
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return { deliveries: page, nextCursor: rows.length > limit && last ? encodeDeliveryCursor(last) : null }
}

export type DeliveryStats = { total: number; success: number; failed: number; pending: number; successRate: number | null; p50LatencyMs: number | null; p95LatencyMs: number | null }

/** One aggregate query over the window (served by the endpointId/createdAt index). */
export async function deliveryStats(endpointId: string, since: Date): Promise<DeliveryStats> {
  const [row] = await prisma.$queryRaw<Array<{ total: number; success: number; failed: number; pending: number; p50: number | null; p95: number | null }>>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status = 'success')::int AS success,
           count(*) FILTER (WHERE status = 'failed')::int AS failed,
           count(*) FILTER (WHERE status = 'pending')::int AS pending,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs") AS p50,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95
    FROM "webhook_deliveries"
    WHERE "endpointId" = ${endpointId} AND "createdAt" >= ${since}`
  const settled = (row?.success ?? 0) + (row?.failed ?? 0)
  return {
    total: row?.total ?? 0,
    success: row?.success ?? 0,
    failed: row?.failed ?? 0,
    pending: row?.pending ?? 0,
    successRate: settled ? Math.round(((row!.success) / settled) * 1000) / 10 : null,
    p50LatencyMs: row?.p50 == null ? null : Math.round(Number(row.p50)),
    p95LatencyMs: row?.p95 == null ? null : Math.round(Number(row.p95)),
  }
}

export async function getDelivery(endpointId: string, deliveryId: string) {
  return prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, endpointId },
    select: { ...SUMMARY_SELECT, payload: true, responseBody: true },
  })
}

/**
 * Queue a fresh copy of every failed delivery in the window (newest first, at
 * most REPLAY_FAILED_MAX) for the retry worker, reserving workspace quota for
 * all of them in one transaction. Failures already replayed are skipped, so
 * pressing the button twice doesn't double-send.
 */
export async function replayFailedDeliveries(endpoint: { id: string; workspaceId: string | null }, since: Date): Promise<{ queued: number; quotaExceeded: boolean }> {
  return prisma.$transaction(async (tx) => {
    const failed = await tx.webhookDelivery.findMany({
      where: { endpointId: endpoint.id, status: 'failed', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: REPLAY_FAILED_MAX,
      select: { id: true, event: true, payload: true },
    })
    if (!failed.length) return { queued: 0, quotaExceeded: false }
    const alreadyReplayed = new Set(
      (await tx.webhookDelivery.findMany({ where: { endpointId: endpoint.id, replayOfId: { in: failed.map((d) => d.id) } }, select: { replayOfId: true } }))
        .map((d) => d.replayOfId),
    )
    const toReplay = failed.filter((d) => !alreadyReplayed.has(d.id))
    if (!toReplay.length) return { queued: 0, quotaExceeded: false }
    if (endpoint.workspaceId) {
      const quota = await reserveUsageInTransaction(tx, endpoint.workspaceId, 'webhook_deliveries', BigInt(toReplay.length))
      if (!quota.allowed) return { queued: 0, quotaExceeded: true }
    }
    const now = new Date()
    await tx.webhookDelivery.createMany({
      data: toReplay.map((d) => ({ endpointId: endpoint.id, event: d.event, payload: d.payload, status: 'pending' as const, nextAttemptAt: now, replayOfId: d.id })),
    })
    return { queued: toReplay.length, quotaExceeded: false }
  })
}
