import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter } from './aggregate-analytics'

/**
 * Creator performance: per workspace member who owns links, how many links they created in the
 * window, and the human clicks their links received versus the preceding window of equal length.
 */
export const CREATOR_WINDOW_OPTIONS = [7, 30, 90] as const
export const CREATOR_DEFAULT_WINDOW = 30
export const CREATOR_MAX_ROWS = 100
const DAY_MS = 86_400_000

export function parseCreatorWindow(raw: string | null): number | null {
  if (raw === null || raw === '') return CREATOR_DEFAULT_WINDOW
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (CREATOR_WINDOW_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type CreatorStat = {
  userId: string | null
  name: string
  totalLinks: number
  newLinks: number
  clicks: number
  previousClicks: number
  changePct: number | null
  sharePct: number
}

type RawRow = {
  userId: string | null
  name: string | null
  email: string | null
  totalLinks: bigint | number
  newLinks: bigint | number
  clicks: bigint | number
  previous: bigint | number
}

/** Display name: profile name, else the email's local part (never the full address), else "Unknown". */
export function creatorDisplayName(name: string | null, email: string | null): string {
  const n = name?.trim()
  if (n) return n
  const local = email?.split('@')[0]?.trim()
  return local || 'Unknown'
}

export function shapeCreatorStats(rows: RawRow[]): CreatorStat[] {
  const total = rows.reduce((s, r) => s + Number(r.clicks), 0)
  return rows
    .map((r) => {
      const clicks = Number(r.clicks)
      const previousClicks = Number(r.previous)
      return {
        userId: r.userId,
        name: creatorDisplayName(r.name, r.email),
        totalLinks: Number(r.totalLinks),
        newLinks: Number(r.newLinks),
        clicks,
        previousClicks,
        changePct: previousClicks > 0 ? Math.round(((clicks - previousClicks) / previousClicks) * 1000) / 10 : null,
        sharePct: total > 0 ? Math.round((clicks / total) * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => b.clicks - a.clicks || b.newLinks - a.newLinks || a.name.localeCompare(b.name))
}

export async function getCreatorPerformance(
  workspaceId: string,
  viewer: { userId: string } | undefined,
  days: number,
  now = new Date(),
) {
  const end = now
  const start = new Date(end.getTime() - days * DAY_MS)
  const prevStart = new Date(start.getTime() - days * DAY_MS)
  const scope = scopeFilter({ kind: 'workspace', workspaceId, viewer })
  // Clicks are aggregated per link first so the join to links/users stays one row per link.
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH per_link AS (
      SELECT c."urlId" AS "urlId",
        COUNT(*) FILTER (WHERE c."createdAt" >= ${start}) AS "clicks",
        COUNT(*) FILTER (WHERE c."createdAt" < ${start}) AS "previous"
      FROM "click_events" c
      WHERE c."trafficType" = 'human' AND c."createdAt" >= ${prevStart} AND c."createdAt" < ${end}
      GROUP BY c."urlId"
    )
    SELECT u."userId" AS "userId", usr."name" AS "name", usr."email" AS "email",
      COUNT(*) AS "totalLinks",
      COUNT(*) FILTER (WHERE u."createdAt" >= ${start}) AS "newLinks",
      COALESCE(SUM(p."clicks"), 0) AS "clicks",
      COALESCE(SUM(p."previous"), 0) AS "previous"
    FROM "urls" u
    LEFT JOIN per_link p ON p."urlId" = u."id"
    LEFT JOIN "users" usr ON usr."id" = u."userId"
    WHERE ${scope}
    GROUP BY u."userId", usr."name", usr."email"
    ORDER BY "clicks" DESC
    LIMIT ${CREATOR_MAX_ROWS}`)
  return { days, from: start.toISOString(), to: end.toISOString(), creators: shapeCreatorStats(rows) }
}
