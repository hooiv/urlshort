import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Paused links: inactive, non-trashed links, longest-paused first, with
 * lifetime clicks so owners can decide to resume or archive them for good.
 * "Paused since" is the row's last update, the closest durable signal.
 */
export const PAUSED_MAX = 200
export const PAUSED_DEFAULT = 50
export const PAUSED_MAX_AGE_DAYS = 3650

export type PausedLink = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; pausedSince: string; pausedDays: number }

function parseIntIn(raw: string | null, def: number, min: number, max: number): number | null {
  if (raw === null || raw === '') return def
  if (!/^\d{1,4}$/.test(raw)) return null
  const n = Number(raw)
  return n >= min && n <= max ? n : null
}

export const parsePausedLimit = (raw: string | null) => parseIntIn(raw, PAUSED_DEFAULT, 1, PAUSED_MAX)
export const parsePausedMinAge = (raw: string | null) => parseIntIn(raw, 0, 0, PAUSED_MAX_AGE_DAYS)

export function pausedDays(since: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000))
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; updatedAt: Date }

export async function findPausedLinks(scope: AnalyticsScope, limit: number, minAgeDays: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - minAgeDays * 86_400_000)
  const where = Prisma.sql`${scopeFilter(scope)} AND u."isActive" = false AND u."updatedAt" <= ${cutoff}`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."updatedAt"
      FROM "urls" u WHERE ${where}
      ORDER BY u."updatedAt" ASC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  const links: PausedLink[] = rows.map((r) => ({
    id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl, clicks: Number(r.clicks),
    pausedSince: r.updatedAt.toISOString(), pausedDays: pausedDays(r.updatedAt, now),
  }))
  return { links, total: Number(counts[0]?.n ?? 0), minAgeDays }
}
