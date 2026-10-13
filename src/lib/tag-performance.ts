import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Tag performance: human clicks per tag over a window versus the window of the
 * same length immediately before it. A link with several tags counts toward each.
 */
export const TAG_WINDOW_OPTIONS = [7, 30, 90] as const
export const TAG_DEFAULT_WINDOW = 30
export const TAG_MAX_ROWS = 100
const DAY_MS = 86_400_000

export function parseTagWindow(raw: string | null): number | null {
  if (raw === null || raw === '') return TAG_DEFAULT_WINDOW
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (TAG_WINDOW_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type TagStat = {
  tag: string
  links: number
  clicks: number
  previousClicks: number
  /** Percent change vs previous window; null when there was no previous traffic. */
  changePct: number | null
  /** Share of all tagged clicks in the window, 0-100, one decimal. */
  sharePct: number
}

type RawRow = { tag: string; links: bigint | number; clicks: bigint | number; previous: bigint | number }

/** Pure: shape rows, compute change and share, order by clicks then tag. */
export function shapeTagStats(rows: RawRow[]): TagStat[] {
  const parsed = rows.map((r) => ({ tag: r.tag, links: Number(r.links), clicks: Number(r.clicks), previousClicks: Number(r.previous) }))
  const total = parsed.reduce((s, r) => s + r.clicks, 0)
  return parsed
    .map((r) => ({
      ...r,
      changePct: r.previousClicks > 0 ? Math.round(((r.clicks - r.previousClicks) / r.previousClicks) * 1000) / 10 : null,
      sharePct: total > 0 ? Math.round((r.clicks / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || a.tag.localeCompare(b.tag))
}

export async function getTagPerformance(scope: AnalyticsScope, days: number, now = new Date()) {
  const end = now
  const start = new Date(end.getTime() - days * DAY_MS)
  const prevStart = new Date(start.getTime() - days * DAY_MS)
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT t."tag" AS "tag", COUNT(DISTINCT u."id") AS "links",
      COUNT(c."id") FILTER (WHERE c."createdAt" >= ${start} AND c."createdAt" < ${end}) AS "clicks",
      COUNT(c."id") FILTER (WHERE c."createdAt" >= ${prevStart} AND c."createdAt" < ${start}) AS "previous"
    FROM "urls" u
    CROSS JOIN LATERAL unnest(u."tags") AS t("tag")
    LEFT JOIN "click_events" c ON c."urlId" = u."id" AND c."trafficType" = 'human' AND c."createdAt" >= ${prevStart} AND c."createdAt" < ${end}
    WHERE ${scopeFilter({ ...scope, tag: undefined })}
    GROUP BY t."tag"
    ORDER BY "clicks" DESC, t."tag" ASC
    LIMIT ${TAG_MAX_ROWS}`)
  return { days, from: start.toISOString(), to: end.toISOString(), tags: shapeTagStats(rows) }
}
