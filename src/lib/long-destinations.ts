import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Long destination URLs: active links whose destination exceeds a length
 * threshold. Very long URLs get truncated by SMS gateways, some email
 * clients and older proxies (~2000 chars), silently breaking campaigns.
 */
export const LONG_URL_DEFAULT_THRESHOLD = 1500
export const LONG_URL_MIN_THRESHOLD = 200
export const LONG_URL_MAX_THRESHOLD = 8000
export const LONG_URL_MAX = 200
export const LONG_URL_DEFAULT = 50
/** Length at which common clients start truncating or rejecting. */
export const LONG_URL_RISK_LENGTH = 2000

export type LongUrlRisk = 'high' | 'elevated'

export function parseLongUrlLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return LONG_URL_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= LONG_URL_MAX ? n : null
}

export function parseLongUrlThreshold(raw: string | null): number | null {
  if (raw === null || raw === '') return LONG_URL_DEFAULT_THRESHOLD
  if (!/^\d{1,4}$/.test(raw)) return null
  const n = Number(raw)
  return n >= LONG_URL_MIN_THRESHOLD && n <= LONG_URL_MAX_THRESHOLD ? n : null
}

export function longUrlRisk(length: number): LongUrlRisk {
  return length >= LONG_URL_RISK_LENGTH ? 'high' : 'elevated'
}

export type LongDestinationLink = {
  id: string
  shortCode: string
  title: string | null
  originalUrl: string
  length: number
  risk: LongUrlRisk
  clicks: number
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; length: number; clicks: number }

export async function findLongDestinations(scope: AnalyticsScope, threshold: number, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)} AND u."isActive" = true AND char_length(u."originalUrl") >= ${threshold}`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", char_length(u."originalUrl")::int AS length, u."clicks"
      FROM "urls" u WHERE ${where}
      ORDER BY u."clicks" DESC, length DESC, u."shortCode" ASC
      LIMIT ${limit}`),
    prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM "urls" u WHERE ${where}`),
  ])
  const links: LongDestinationLink[] = rows.map((r) => ({ ...r, risk: longUrlRisk(r.length) }))
  return { links, total: Number(counts[0]?.total ?? 0), threshold }
}
