import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { withRedis } from '@/lib/redis'
import { invalidateLink } from '@/lib/link-cache'
import { publishRealtime } from '@/lib/realtime'
import { prepareClicks, dedupeClickIds } from '@/lib/click-ingestion'
import { dispatchWebhooksForUrl } from '@/lib/webhooks'

export type ClickData = {
  clickEventId: string
  urlId: string
  ruleId?: string | null
  campaignVariantId?: string | null
  ip?: string | null
  userAgent?: string | null
  referer?: string | null
  referrerHost?: string | null
  country?: string | null
  deviceType?: string | null
  trafficType?: string | null
  trafficConfidence?: number
  aiAgent?: string | null
  os?: string | null
  browser?: string | null
  language?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmTerm?: string | null
  utmContent?: string | null
  visitorIdHash?: string | null
  dateKey: string
  shortCode: string
  /** True when tenant click quota was reserved before the redirect was accepted. */
  usageReserved?: boolean
  /**
   * True for automated crawler/preview traffic. The event is still persisted
   * and rolled up for analytics transparency, but it is excluded from tenant
   * quota accounting so bots can never burn a customer's click budget.
   */
  nonBillable?: boolean
}

export interface ClickQueue {
  push(data: ClickData): Promise<void>
  processBatch(): Promise<void>
}

/**
 * Group raw click events by URL and by (URL, day) so batch persistence issues
 * O(distinct keys) writes instead of one write per click. Pure & unit-tested;
 * both queue backends share it.
 */
export function aggregateClicks(items: ClickData[]): {
  perUrl: Map<string, { count: number; shortCode?: string }>
  perDay: Map<string, { urlId: string; dateKey: string; count: number }>
} {
  const perUrl = new Map<string, { count: number; shortCode?: string }>()
  const perDay = new Map<string, { urlId: string; dateKey: string; count: number }>()

  for (const item of items) {
    const urlEntry = perUrl.get(item.urlId)
    if (urlEntry) {
      urlEntry.count += 1
    } else {
      perUrl.set(item.urlId, { count: 1, shortCode: item.shortCode })
    }

    const dayKey = `${item.urlId}|${item.dateKey}`
    const dayEntry = perDay.get(dayKey)
    if (dayEntry) {
      dayEntry.count += 1
    } else {
      perDay.set(dayKey, { urlId: item.urlId, dateKey: item.dateKey, count: 1 })
    }
  }
  return { perUrl, perDay }
}

async function persistBatch(parsedItems: ClickData[]): Promise<void> {
  // Redis retries can surface the same event more than once. Deduplicate
  // before calculating counters so idempotent event storage is also
  // idempotent for aggregate totals.
  const prepared = await prepareClicks(parsedItems)
  const uniqueItems = dedupeClickIds(prepared)
  // Group by URL / date to keep write volume proportional to distinct keys.
  let perUrl = new Map<string, { count: number; shortCode?: string }>()
  let perDay = new Map<string, { urlId: string; dateKey: string; count: number }>()

  await prisma.$transaction(async (tx) => {
    // Insert and return only newly-created event ids. A preflight existence
    // check is racy under concurrent workers and can double-count aggregates.
    const values = uniqueItems.map((item) => Prisma.sql`(
      ${item.clickEventId}, ${item.urlId}, ${item.ruleId}, ${item.campaignVariantId},
      ${item.ip}, ${item.userAgent}, ${item.referer}, ${item.referrerHost}, ${item.country},
      ${item.deviceType}, ${item.trafficType ?? 'human'}::"TrafficType", ${item.aiAgent},
      ${item.os}, ${item.browser}, ${item.language}, ${item.utmSource}, ${item.utmMedium},
      ${item.utmCampaign}, ${item.utmTerm}, ${item.utmContent}, ${item.visitorIdHash}
    )`)
    const inserted = uniqueItems.length === 0 ? [] : await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "click_events"
        ("id","urlId","ruleId","campaignVariantId","ip","userAgent","referer","referrerHost","country",
         "deviceType","trafficType","aiAgent","os","browser","language","utmSource","utmMedium",
         "utmCampaign","utmTerm","utmContent","visitorIdHash")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("id") DO NOTHING
      RETURNING "id"
    `)
    const insertedIds = new Set(inserted.map((row) => row.id))
    const insertedItems = uniqueItems.filter((item) => insertedIds.has(item.clickEventId))
    if (insertedItems.length === 0) return
    ({ perUrl, perDay } = aggregateClicks(insertedItems))

    // 2. Bulk update URL totals; deactivate links that hit their click cap.
    // Non-billable (bot/crawler) events are persisted and aggregated above
    // but excluded from tenant quota accounting below — see ClickData.nonBillable.
    const billableItems = insertedItems.filter((item) => !item.nonBillable)
    const workspaceCounts = new Map<string, number>()
    const workspaceRows = await tx.url.findMany({ where: { id: { in: [...new Set(billableItems.map(i => i.urlId))] } }, select: { id: true, workspaceId: true } })
    const workspaceByUrl = new Map(workspaceRows.map(x => [x.id, x.workspaceId]))
    for (const item of billableItems) { const workspaceId = workspaceByUrl.get(item.urlId); if (workspaceId) workspaceCounts.set(workspaceId, (workspaceCounts.get(workspaceId) || 0) + 1) }
    const reservedCounts = new Map<string, number>()
    for (const item of billableItems) {
      if (!item.usageReserved) continue
      const workspaceId = workspaceByUrl.get(item.urlId)
      if (workspaceId) reservedCounts.set(workspaceId, (reservedCounts.get(workspaceId) || 0) + 1)
    }
    const variantCounts = new Map<string, number>()
    for (const item of insertedItems) if (item.campaignVariantId) variantCounts.set(item.campaignVariantId, (variantCounts.get(item.campaignVariantId) || 0) + 1)
    for (const [variantId, count] of variantCounts) await tx.campaignVariant.update({ where: { id: variantId }, data: { clicks: { increment: count } } })
    for (const [urlId, aggregate] of perUrl.entries()) {
      const updatedUrl = await tx.url.update({
        where: { id: urlId },
        data: { clicks: { increment: aggregate.count } },
        select: { clicks: true, maxClicks: true },
      })

      if (updatedUrl.maxClicks && updatedUrl.clicks >= updatedUrl.maxClicks) {
        await tx.url.update({ where: { id: urlId }, data: { isActive: false } })
        if (aggregate.shortCode) await invalidateLink(aggregate.shortCode, urlId)
      }
    }

    // 3. Account for click ingestion. This is deliberately inside the same transactional boundary.
    for (const [workspaceId, count] of workspaceCounts) {
      const measuredCount = count - (reservedCounts.get(workspaceId) || 0)
      if (measuredCount <= 0) continue
      await tx.usageBucket.upsert({ where: { workspaceId_metric_periodKey: { workspaceId, metric: 'clicks', periodKey: new Date().toISOString().slice(0, 7) } }, create: { workspaceId, metric: 'clicks', periodKey: new Date().toISOString().slice(0, 7), quantity: BigInt(measuredCount) }, update: { quantity: { increment: BigInt(measuredCount) } } })
      // Preserve measured usage when a batch crosses its quota. The click has
      // already been accepted/persisted; rolling usage back would leave the
      // quota ledger inconsistent with the event stream and hide overage.
    }

    // 4. Upsert daily rollups.
    for (const [, entry] of perDay.entries()) {
      await tx.clickDaily.upsert({
        where: { urlId_dateKey: { urlId: entry.urlId, dateKey: entry.dateKey } },
        create: { urlId: entry.urlId, dateKey: entry.dateKey, clicks: entry.count },
        update: { clicks: { increment: entry.count } },
      })
    }
  })
  publishRealtime('click.batch', { count: uniqueItems.length, urlIds: [...perUrl.keys()] })
  // Analytics webhooks are durable DB deliveries; dispatch is intentionally outside
  // the click transaction so a slow consumer can never block redirect ingestion.
  await Promise.allSettled(uniqueItems.map(item => dispatchWebhooksForUrl(item.urlId, 'link.clicked', {
    id: item.clickEventId, urlId: item.urlId, shortCode: item.shortCode, ruleId: item.ruleId ?? null,
    campaignVariantId: item.campaignVariantId ?? null, country: item.country ?? null,
    occurredAt: new Date().toISOString(),
  })))
}

class DirectClickQueue implements ClickQueue {
  async push(data: ClickData): Promise<void> {
    // A direct insert is the last durable fallback. Propagate a DB failure so
    // the caller can retry instead of reporting success after losing the click.
    await persistBatch([data])
  }

  async processBatch(): Promise<void> {
    // No-op for direct queue; every click is already persisted in push().
  }
}

class RedisClickQueue implements ClickQueue {
  private static readonly BATCH_SIZE = 1000
  private static readonly PROCESSING_KEY = 'click_queue_processing'
  private static readonly DLQ_KEY = 'click_queue_dlq'

  /**
   * Durability first: enqueue to Redis when healthy; if that fails for any
   * reason (connection refused, timeout, deploy churn) fall back to writing
   * straight to Postgres so a click is never dropped.
   */
  async push(data: ClickData): Promise<void> {
    const enqueued = await withRedis(
      (client) => client.lpush('click_queue', JSON.stringify(data)).then(() => true),
      false
    )
    if (!enqueued) {
      await this.persistDirectly(data, 'redis unavailable or push failed')
    }
  }

  private async persistDirectly(data: ClickData, reason: string): Promise<void> {
    console.warn(`Recording click directly (${reason})`)
    // Do not swallow the final persistence error: there is no durable store
    // left to recover from once both Redis and Postgres are unavailable.
    await persistBatch([data])
  }

  async processBatch(): Promise<void> {
    type MoveResult = { ok: false } | { ok: true; items: string[] }
    const result = await withRedis<MoveResult>(
      async (client) => {
        // Recover entries left in the processing list by a worker that died
        // after claiming them. Duplicate delivery is safe because persistence
        // is keyed by the event id and aggregates only newly inserted rows.
        for (let i = 0; i < RedisClickQueue.BATCH_SIZE; i++) {
          const recovered = await client.rpoplpush(RedisClickQueue.PROCESSING_KEY, 'click_queue')
          if (recovered == null) break
        }
        const items: string[] = []
        for (let i = 0; i < RedisClickQueue.BATCH_SIZE; i++) {
          const claimed = await client.rpoplpush('click_queue', RedisClickQueue.PROCESSING_KEY)
          if (claimed == null) break
          items.push(String(claimed))
        }
        return { ok: true, items }
      },
      { ok: false }
    )
    // A Redis outage leaves both queues untouched; a worker crash leaves the
    // item in PROCESSING_KEY until a later worker reclaims it.
    if (!result.ok) return

    const rawItems: unknown[] = result.items
    if (!rawItems.length) return

    const parsedItems: ClickData[] = []
    const malformedItems: string[] = []
    for (const raw of rawItems) {
      try {
        const value: unknown = JSON.parse(String(raw))
        if (!isClickData(value)) throw new Error('invalid click payload')
        parsedItems.push(value)
      } catch {
        // Never silently discard poison messages. They are quarantined only
        // after the DB batch succeeds, and remain in PROCESSING_KEY if the
        // quarantine operation itself fails.
        malformedItems.push(String(raw))
        console.error('Quarantining malformed click-queue payload')
      }
    }
    if (!parsedItems.length) {
      await this.quarantineMalformed(malformedItems)
      return
    }

    try {
      await persistBatch(parsedItems)
      // Acknowledge only after the database transaction commits. Event-id
      // dedup makes a crash between commit and acknowledgement safe.
      const acknowledged = await withRedis(
        (client) => Promise.all(rawItems.filter(raw => !malformedItems.includes(String(raw))).map((raw) => client.lrem(RedisClickQueue.PROCESSING_KEY, 1, String(raw)))).then(() => true),
        false
      )
      if (!acknowledged) console.error('Click queue acknowledgement failed; items remain durable for retry')
      await this.quarantineMalformed(malformedItems)
    } catch (e) {
      console.error('Redis click queue batch process failed:', e)
      // Do not destructively requeue on a failed persistence transaction.
      // The processing list is the durable pending set and will be reclaimed
      // by the next worker once Redis is healthy again.
    }
  }

  private async quarantineMalformed(items: string[]): Promise<void> {
    if (!items.length) return
    const quarantined = await withRedis(
      client => client.lpush(RedisClickQueue.DLQ_KEY, ...items).then(() => true),
      false
    )
    if (!quarantined) {
      console.error('Click queue DLQ unavailable; malformed items remain durable for retry')
      return
    }
    const acknowledged = await withRedis(
      client => Promise.all(items.map(raw => client.lrem(RedisClickQueue.PROCESSING_KEY, 1, raw))).then(() => true),
      false
    )
    if (!acknowledged) console.error('Click queue DLQ acknowledgement failed; duplicate quarantine is possible')
  }
}

function isClickData(value: unknown): value is ClickData {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.clickEventId === 'string' && item.clickEventId.length > 0
    && typeof item.urlId === 'string' && item.urlId.length > 0
    && typeof item.dateKey === 'string' && item.dateKey.length > 0
    && typeof item.shortCode === 'string' && item.shortCode.length > 0
}

const globalForQueue = globalThis as unknown as { __qlClickQueue?: ClickQueue }

function createClickQueue(): ClickQueue {
  const redisConfigured = process.env.REDIS_URL || (process.env.NODE_ENV === 'test' && process.env.SOAK_REDIS_URL)
  return redisConfigured ? new RedisClickQueue() : new DirectClickQueue()
}

export const clickQueue: ClickQueue =
  globalForQueue.__qlClickQueue ?? (globalForQueue.__qlClickQueue = createClickQueue())
