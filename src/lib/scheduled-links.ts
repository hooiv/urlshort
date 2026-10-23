import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Workspace links whose go-live time (startsAt) is still in the future,
 * soonest first, so owners can see what is about to launch or launch it early.
 */
export const SCHEDULED_MAX = 200
export const SCHEDULED_DEFAULT = 50

export type ScheduledLink = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; startsAt: Date }

export function parseScheduledLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return SCHEDULED_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= SCHEDULED_MAX ? n : null
}

export async function findScheduledLinks(workspaceScope: Extract<AnalyticsScope, { kind: 'workspace' }>, limit: number) {
  const where = Prisma.sql`${scopeFilter(workspaceScope)} AND u."startsAt" > NOW()`
  const [links, counts] = await Promise.all([
    prisma.$queryRaw<ScheduledLink[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."startsAt"
      FROM "urls" u WHERE ${where}
      ORDER BY u."startsAt" ASC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  return { links, total: Number(counts[0]?.n ?? 0) }
}
