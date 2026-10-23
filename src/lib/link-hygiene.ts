import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Link hygiene summary: one-query counts of links needing attention,
 * so a dashboard can show "what to fix" without N list calls.
 */
export const EXPIRING_SOON_DAYS = 7
const DAY_MS = 86_400_000

export type LinkHygiene = {
  total: number
  active: number
  archived: number
  destinationDown: number
  destinationDegraded: number
  expired: number
  expiringSoon: number
  scheduled: number
  clickLimitReached: number
  flaggedRisky: number
  untagged: number
  passwordProtected: number
}

type Row = Record<keyof LinkHygiene, bigint | number | null>

const n = (v: bigint | number | null | undefined) => Number(v ?? 0)

/** Pure: normalise the aggregate row (bigint/null safe). */
export function shapeHygiene(row: Row): LinkHygiene {
  return {
    total: n(row.total), active: n(row.active), archived: n(row.archived),
    destinationDown: n(row.destinationDown), destinationDegraded: n(row.destinationDegraded),
    expired: n(row.expired), expiringSoon: n(row.expiringSoon), scheduled: n(row.scheduled),
    clickLimitReached: n(row.clickLimitReached), flaggedRisky: n(row.flaggedRisky),
    untagged: n(row.untagged), passwordProtected: n(row.passwordProtected),
  }
}

export async function getLinkHygiene(scope: AnalyticsScope, now = new Date()): Promise<LinkHygiene> {
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS)
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT
      COUNT(*) AS "total",
      COUNT(*) FILTER (WHERE u."isActive") AS "active",
      COUNT(*) FILTER (WHERE NOT u."isActive") AS "archived",
      COUNT(*) FILTER (WHERE u."isActive" AND u."healthStatus" = 'down') AS "destinationDown",
      COUNT(*) FILTER (WHERE u."isActive" AND u."healthStatus" = 'degraded') AS "destinationDegraded",
      COUNT(*) FILTER (WHERE u."isActive" AND u."expiresAt" IS NOT NULL AND u."expiresAt" <= ${now}) AS "expired",
      COUNT(*) FILTER (WHERE u."isActive" AND u."expiresAt" > ${now} AND u."expiresAt" <= ${soon}) AS "expiringSoon",
      COUNT(*) FILTER (WHERE u."isActive" AND u."startsAt" > ${now}) AS "scheduled",
      COUNT(*) FILTER (WHERE u."isActive" AND u."maxClicks" IS NOT NULL AND u."clicks" >= u."maxClicks") AS "clickLimitReached",
      COUNT(*) FILTER (WHERE u."riskStatus" <> 'cleared') AS "flaggedRisky",
      COUNT(*) FILTER (WHERE u."isActive" AND cardinality(u."tags") = 0) AS "untagged",
      COUNT(*) FILTER (WHERE u."passwordHash" IS NOT NULL) AS "passwordProtected"
    FROM "urls" u
    WHERE ${scopeFilter(scope)}`)
  return shapeHygiene(rows[0])
}

export type HygieneScore = { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F'; penalties: { issue: keyof LinkHygiene; count: number; points: number }[] }

/** Points deducted when 100% of active links have the issue; scaled by the affected share. */
const WEIGHTS: Partial<Record<keyof LinkHygiene, number>> = {
  destinationDown: 40, flaggedRisky: 30, expired: 15, destinationDegraded: 10,
  clickLimitReached: 10, expiringSoon: 5, untagged: 5,
}

/** Pure: 0-100 health score from hygiene counts. Empty workspaces score 100. */
export function scoreHygiene(h: LinkHygiene): HygieneScore {
  const denom = Math.max(1, h.active)
  const penalties: HygieneScore['penalties'] = []
  let lost = 0
  for (const [issue, weight] of Object.entries(WEIGHTS) as [keyof LinkHygiene, number][]) {
    const count = h[issue]
    if (!count) continue
    const points = Math.round(Math.min(1, count / denom) * weight * 10) / 10
    lost += points
    penalties.push({ issue, count, points })
  }
  penalties.sort((a, b) => b.points - a.points)
  const score = Math.max(0, Math.round(100 - lost))
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'
  return { score, grade, penalties }
}
