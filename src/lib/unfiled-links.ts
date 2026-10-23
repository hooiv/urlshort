import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Workspace links that sit in no folder, busiest first, so owners can file the
 * links that matter most. Only meaningful for workspace scopes.
 */
export const UNFILED_MAX = 200
export const UNFILED_DEFAULT = 50

export type UnfiledLink = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number }

export function parseUnfiledLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return UNFILED_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= UNFILED_MAX ? n : null
}

export async function findUnfiledLinks(workspaceScope: Extract<AnalyticsScope, { kind: 'workspace' }>, limit: number) {
  const where = Prisma.sql`${scopeFilter({ ...workspaceScope, folderId: null })}`
  const [links, counts] = await Promise.all([
    prisma.$queryRaw<UnfiledLink[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks"
      FROM "urls" u WHERE ${where}
      ORDER BY u."clicks" DESC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  return { links, total: Number(counts[0]?.n ?? 0) }
}
