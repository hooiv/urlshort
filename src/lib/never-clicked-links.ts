import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Never-clicked links: active links older than a minimum age with zero
 * recorded clicks, oldest first, so owners can fix or archive dead launches.
 */
export const NEVER_CLICKED_MAX = 200
export const NEVER_CLICKED_DEFAULT = 50
export const NEVER_CLICKED_DEFAULT_MIN_AGE_DAYS = 7
export const NEVER_CLICKED_MAX_AGE_DAYS = 3650

export type NeverClickedLink = { id: string; shortCode: string; title: string | null; originalUrl: string; createdAt: string; ageDays: number }

function parseIntIn(raw: string | null, def: number, min: number, max: number): number | null {
  if (raw === null || raw === '') return def
  if (!/^\d{1,4}$/.test(raw)) return null
  const n = Number(raw)
  return n >= min && n <= max ? n : null
}

export const parseNeverClickedLimit = (raw: string | null) => parseIntIn(raw, NEVER_CLICKED_DEFAULT, 1, NEVER_CLICKED_MAX)
export const parseNeverClickedMinAge = (raw: string | null) => parseIntIn(raw, NEVER_CLICKED_DEFAULT_MIN_AGE_DAYS, 0, NEVER_CLICKED_MAX_AGE_DAYS)

/** Whole days between two instants, never negative. */
export function ageInDays(createdAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000))
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; createdAt: Date }

export async function findNeverClickedLinks(scope: AnalyticsScope, limit: number, minAgeDays: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - minAgeDays * 86_400_000)
  const where = Prisma.sql`${scopeFilter(scope)} AND u."isActive" = true AND u."clicks" = 0 AND u."createdAt" <= ${cutoff}`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."createdAt"
      FROM "urls" u WHERE ${where}
      ORDER BY u."createdAt" ASC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  const links: NeverClickedLink[] = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), ageDays: ageInDays(r.createdAt, now) }))
  return { links, total: Number(counts[0]?.n ?? 0), minAgeDays }
}
