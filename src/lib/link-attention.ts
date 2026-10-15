import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'
import { EXPIRING_SOON_DAYS } from './link-hygiene'

/**
 * Drill-down for the hygiene summary: the actual links behind each counter,
 * most-clicked first, so owners fix the issues that cost the most traffic.
 */
export const ATTENTION_ISSUES = ['down', 'degraded', 'expired', 'expiringSoon', 'scheduled', 'clickLimitReached', 'flaggedRisky', 'untagged'] as const
export type AttentionIssue = (typeof ATTENTION_ISSUES)[number]

export const MAX_ATTENTION_LIMIT = 100
export const DEFAULT_ATTENTION_LIMIT = 25

export function parseAttentionIssue(raw: string | null): AttentionIssue | null {
  return raw && (ATTENTION_ISSUES as readonly string[]).includes(raw) ? (raw as AttentionIssue) : null
}

export function parseAttentionLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return DEFAULT_ATTENTION_LIMIT
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= MAX_ATTENTION_LIMIT ? n : null
}

/** Predicates mirror getLinkHygiene exactly so counts and lists always agree. */
export function issuePredicate(issue: AttentionIssue, now: Date): Prisma.Sql {
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86_400_000)
  switch (issue) {
    case 'down': return Prisma.sql`u."isActive" AND u."healthStatus" = 'down'`
    case 'degraded': return Prisma.sql`u."isActive" AND u."healthStatus" = 'degraded'`
    case 'expired': return Prisma.sql`u."isActive" AND u."expiresAt" IS NOT NULL AND u."expiresAt" <= ${now}`
    case 'expiringSoon': return Prisma.sql`u."isActive" AND u."expiresAt" > ${now} AND u."expiresAt" <= ${soon}`
    case 'scheduled': return Prisma.sql`u."isActive" AND u."startsAt" > ${now}`
    case 'clickLimitReached': return Prisma.sql`u."isActive" AND u."maxClicks" IS NOT NULL AND u."clicks" >= u."maxClicks"`
    case 'flaggedRisky': return Prisma.sql`u."riskStatus" <> 'cleared'`
    case 'untagged': return Prisma.sql`u."isActive" AND cardinality(u."tags") = 0`
  }
}

export type AttentionLink = { id: string; shortCode: string; originalUrl: string; clicks: number }

export async function listLinksNeedingAttention(scope: AnalyticsScope, issue: AttentionIssue, limit: number, now = new Date()): Promise<AttentionLink[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; shortCode: string; originalUrl: string; clicks: bigint | number }>>(Prisma.sql`
    SELECT u."id", u."shortCode", u."originalUrl", u."clicks"
    FROM "urls" u
    WHERE ${scopeFilter(scope)} AND ${issuePredicate(issue, now)}
    ORDER BY u."clicks" DESC, u."id" ASC
    LIMIT ${limit}`)
  return rows.map((r) => ({ id: r.id, shortCode: r.shortCode, originalUrl: r.originalUrl, clicks: Number(r.clicks) }))
}
