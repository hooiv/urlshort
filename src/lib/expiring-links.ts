import { prisma } from '@/lib/prisma'
import { visibleUrlWhere } from '@/lib/folders'
import { projectCapRunway, runwayDateKeys, type CapRunway } from '@/lib/cap-runway'

/**
 * Links that will stop working soon: either a time expiry inside the horizon
 * or a click cap that is nearly used up. Lets owners renew before visitors hit
 * the fallback page.
 */
export const MAX_EXPIRY_HORIZON_DAYS = 90
export const DEFAULT_EXPIRY_HORIZON_DAYS = 7
/** A click-capped link is "running out" at or above this share of its cap. */
export const CAP_WARNING_RATIO = 0.8

export type ExpiringReason = 'time' | 'clicks'
export type ExpiringLink = {
  id: string
  shortCode: string
  originalUrl: string
  reason: ExpiringReason
  expiresAt: string | null
  msUntilExpiry: number | null
  clicks: number
  maxClicks: number | null
  remainingClicks: number | null
  /** Projected cap exhaustion from the last 7 days' rate; null for links without a cap. */
  runway: CapRunway | null
}

export function parseHorizonDays(raw: string | null): number | null {
  if (raw === null || raw === '') return DEFAULT_EXPIRY_HORIZON_DAYS
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= MAX_EXPIRY_HORIZON_DAYS ? n : null
}

type Row = { id: string; shortCode: string; originalUrl: string; expiresAt: Date | null; clicks: number; maxClicks: number | null }

/** Pure classification so the SQL filter and the output stay in lockstep. */
export function classifyExpiring(row: Row, now: Date, horizonDays: number, recentClicks = 0): ExpiringLink | null {
  const horizon = now.getTime() + horizonDays * 86_400_000
  const timeSoon = row.expiresAt !== null && row.expiresAt.getTime() > now.getTime() && row.expiresAt.getTime() <= horizon
  const capSoon = row.maxClicks !== null && row.maxClicks > 0 && row.clicks < row.maxClicks && row.clicks / row.maxClicks >= CAP_WARNING_RATIO
  const runway = row.maxClicks !== null && row.maxClicks > 0 && row.clicks < row.maxClicks
    ? projectCapRunway(row.maxClicks - row.clicks, recentClicks, now)
    : null
  const burningFast = runway !== null && runway.daysRemaining !== null && runway.daysRemaining <= horizonDays
  if (!timeSoon && !capSoon && !burningFast) return null
  return {
    id: row.id,
    shortCode: row.shortCode,
    originalUrl: row.originalUrl,
    reason: timeSoon ? 'time' : 'clicks',
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    msUntilExpiry: timeSoon && row.expiresAt ? row.expiresAt.getTime() - now.getTime() : null,
    clicks: row.clicks,
    maxClicks: row.maxClicks,
    remainingClicks: row.maxClicks === null ? null : Math.max(0, row.maxClicks - row.clicks),
    runway,
  }
}

export async function listExpiringLinks(userId: string, horizonDays: number, limit = 100, now: Date = new Date()): Promise<ExpiringLink[]> {
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000)
  const rows = await prisma.url.findMany({
    where: {
      AND: [
        { deletedAt: null, isActive: true },
        { OR: [{ expiresAt: { gt: now, lte: horizon } }, { maxClicks: { not: null } }] },
        visibleUrlWhere(userId),
      ],
    },
    select: { id: true, shortCode: true, originalUrl: true, expiresAt: true, clicks: true, maxClicks: true },
    orderBy: { expiresAt: 'asc' },
    take: 1000,
  })
  const capped = rows.filter((r) => r.maxClicks !== null && r.clicks < r.maxClicks).map((r) => r.id)
  const recent = new Map<string, number>()
  if (capped.length > 0) {
    const grouped = await prisma.clickDaily.groupBy({
      by: ['urlId'],
      where: { urlId: { in: capped }, dateKey: { in: runwayDateKeys(now) } },
      _sum: { clicks: true },
    })
    for (const g of grouped) recent.set(g.urlId, g._sum.clicks ?? 0)
  }
  return rows
    .map((r) => classifyExpiring(r, now, horizonDays, recent.get(r.id) ?? 0))
    .filter((r): r is ExpiringLink => r !== null)
    .sort((a, b) => (a.msUntilExpiry ?? Infinity) - (b.msUntilExpiry ?? Infinity) || (a.remainingClicks ?? 0) - (b.remainingClicks ?? 0))
    .slice(0, limit)
}
