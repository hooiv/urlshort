import { prisma } from '@/lib/prisma'
import { withRedis } from '@/lib/redis'
import { invalidateLink } from '@/lib/link-cache'

export type ClickData = {
  clickEventId: string
  urlId: string
  ruleId?: string | null
  userAgent?: string | null
  referer?: string | null
  referrerHost?: string | null
  country?: string | null
  deviceType?: string | null
  trafficType?: string | null
  aiAgent?: string | null
  os?: string | null
  browser?: string | null
  language?: string | null
  visitorIdHash?: string | null
  dateKey: string
  shortCode: string
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
  const uniqueItems = [...new Map(parsedItems.map((item) => [item.clickEventId, item])).values()]
  // Group by URL / date to keep write volume proportional to distinct keys.
  const { perUrl, perDay } = aggregateClicks(uniqueItems)

  await prisma.$transaction(async (tx) => {
    // 1. Bulk insert click events (idempotent per click id).
    await tx.clickEvent.createMany({
      data: uniqueItems.map((item) => ({
        id: item.clickEventId,
        urlId: item.urlId,
        ruleId: item.ruleId,
        userAgent: item.userAgent,
        referer: item.referer,
        referrerHost: item.referrerHost,
        country: item.country,
        deviceType: item.deviceType as any,
        trafficType: item.trafficType as any,
        aiAgent: item.aiAgent,
        os: item.os,
        browser: item.browser,
        language: item.language,
        visitorIdHash: item.visitorIdHash,
      })),
      skipDuplicates: true,
    })

    // 2. Bulk update URL totals; deactivate links that hit their click cap.
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

    // 3. Upsert daily rollups.
    for (const [, entry] of perDay.entries()) {
      await tx.clickDaily.upsert({
        where: { urlId_dateKey: { urlId: entry.urlId, dateKey: entry.dateKey } },
        create: { urlId: entry.urlId, dateKey: entry.dateKey, clicks: entry.count },
        update: { clicks: { increment: entry.count } },
      })
    }
  })
}

class DirectClickQueue implements ClickQueue {
  async push(data: ClickData): Promise<void> {
    try {
      await persistBatch([data])
    } catch (e) {
      console.error('Click queue direct insert failed:', e)
    }
  }

  async processBatch(): Promise<void> {
    // No-op for direct queue; every click is already persisted in push().
  }
}

class RedisClickQueue implements ClickQueue {
  private static readonly BATCH_SIZE = 1000

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
    try {
      await persistBatch([data])
    } catch (e) {
      console.error('Fallback direct insert also failed:', e)
    }
  }

  async processBatch(): Promise<void> {
    type PopResult = { ok: false } | { ok: true; items: string[] | null }
    const result = await withRedis<PopResult>(
      async (client) => ({ ok: true, items: await client.rpop('click_queue', RedisClickQueue.BATCH_SIZE) }),
      { ok: false }
    )
    // Leaving items untouched on failure: the next cron tick retries safely.
    if (!result.ok) return

    const rawItems: unknown[] = result.items && result.items.length > 0 ? result.items : []
    if (!rawItems.length) return

    const parsedItems: ClickData[] = []
    for (const raw of rawItems) {
      try {
        parsedItems.push(JSON.parse(String(raw)) as ClickData)
      } catch {
        // Unparseable entries are logged and discarded rather than poisoning
        // the whole batch forever.
        console.error('Discarding malformed click-queue payload')
      }
    }
    if (!parsedItems.length) return

    try {
      await persistBatch(parsedItems)
    } catch (e) {
      console.error('Redis click queue batch process failed:', e)
      // Put everything back at the head of the queue for retry. Exact-dedup
      // on insert (unique ids + skipDuplicates) keeps double-processing safe.
      const requeued = await withRedis(
        (client) => client.lpush('click_queue', ...rawItems.map((raw) => String(raw))).then(() => true),
        false
      )
      if (!requeued) {
        console.error('Critical: requeue failed, clicks may be lost')
      }
    }
  }
}

const globalForQueue = globalThis as unknown as { __qlClickQueue?: ClickQueue }

function createClickQueue(): ClickQueue {
  return process.env.REDIS_URL ? new RedisClickQueue() : new DirectClickQueue()
}

export const clickQueue: ClickQueue =
  globalForQueue.__qlClickQueue ?? (globalForQueue.__qlClickQueue = createClickQueue())
