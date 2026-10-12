import { Prisma } from '@prisma/client'

/**
 * Dimension rollups: per link, per day human click counts by country / device /
 * referrer host. Written in the same transaction as click_daily so the analytics
 * breakdown cards read O(links x days x distinct values) rows rather than
 * scanning click_events. Bot/crawler traffic is excluded, matching the
 * `trafficType = 'human'` filter the breakdown queries used before.
 */
export const CLICK_DIMENSIONS = ['country', 'device', 'referrer'] as const
export type ClickDimension = (typeof CLICK_DIMENSIONS)[number]

export type DimensionClick = {
  urlId: string
  dateKey: string
  trafficType?: string | null
  country?: string | null
  deviceType?: string | null
  referrerHost?: string | null
}

export type DimensionRow = { urlId: string; dateKey: string; dimension: ClickDimension; key: string; clicks: number }

const UNKNOWN = 'unknown'
const MAX_KEY_LENGTH = 255

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, MAX_KEY_LENGTH) : UNKNOWN
}

export function aggregateDimensions(items: DimensionClick[]): DimensionRow[] {
  const rows = new Map<string, DimensionRow>()
  const add = (item: DimensionClick, dimension: ClickDimension, key: string) => {
    const id = `${item.urlId}\u0000${item.dateKey}\u0000${dimension}\u0000${key}`
    const row = rows.get(id)
    if (row) row.clicks += 1
    else rows.set(id, { urlId: item.urlId, dateKey: item.dateKey, dimension, key, clicks: 1 })
  }
  for (const item of items) {
    if ((item.trafficType ?? 'human') !== 'human') continue
    add(item, 'country', clean(item.country))
    add(item, 'device', clean(item.deviceType))
    add(item, 'referrer', clean(item.referrerHost))
  }
  return [...rows.values()]
}

type SqlExecutor = { $executeRaw: (query: Prisma.Sql) => Promise<number> }

/** Upsert increments for every row in one statement (idempotency comes from the click insert's ON CONFLICT DO NOTHING). */
export async function applyDimensionRollups(tx: SqlExecutor, rows: DimensionRow[]): Promise<void> {
  if (rows.length === 0) return
  // Sorted so concurrent batches take row locks in the same order (no deadlocks).
  const sorted = [...rows].sort((a, b) => (a.urlId + a.dateKey + a.dimension + a.key).localeCompare(b.urlId + b.dateKey + b.dimension + b.key))
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "click_dimension_daily" ("urlId","dateKey","dimension","key","clicks","updatedAt")
    SELECT * FROM unnest(${sorted.map((r) => r.urlId)}::text[], ${sorted.map((r) => r.dateKey)}::text[],
      ${sorted.map((r) => r.dimension)}::text[], ${sorted.map((r) => r.key)}::text[], ${sorted.map((r) => r.clicks)}::int[],
      ${sorted.map(() => new Date())}::timestamp[])
    ON CONFLICT ("urlId","dateKey","dimension","key")
    DO UPDATE SET "clicks" = "click_dimension_daily"."clicks" + EXCLUDED."clicks", "updatedAt" = EXCLUDED."updatedAt"
  `)
}
