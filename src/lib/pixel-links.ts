import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Links carrying at least one retargeting pixel/tag (Meta, Google, X, LinkedIn,
 * TikTok, Pinterest, Snap, Reddit, Microsoft UET). Lets owners audit which
 * links fire third-party tags, and how many each fires.
 */
export const PIXEL_MAX = 200
export const PIXEL_DEFAULT = 50

export const PIXEL_COLUMNS = [
  ['metaPixelId', 'Meta'], ['googleTagId', 'Google'], ['xPixelId', 'X'], ['linkedinPartnerId', 'LinkedIn'],
  ['tiktokPixelId', 'TikTok'], ['pinterestTagId', 'Pinterest'], ['snapPixelId', 'Snap'],
  ['redditPixelId', 'Reddit'], ['uetTagId', 'Microsoft'],
] as const

export function parsePixelLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return PIXEL_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= PIXEL_MAX ? n : null
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number } & Record<string, unknown>

/** Platform names whose id column is set (non-empty) on a row. */
export function platformsOf(row: Record<string, unknown>): string[] {
  return PIXEL_COLUMNS.filter(([col]) => typeof row[col] === 'string' && (row[col] as string).length > 0).map(([, name]) => name)
}

const hasAny = Prisma.join(PIXEL_COLUMNS.map(([col]) => Prisma.sql`COALESCE(u.${Prisma.raw(`"${col}"`)}, '') <> ''`), ' OR ')

export async function findPixelLinks(scope: AnalyticsScope, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)} AND (${hasAny})`
  const cols = Prisma.raw(PIXEL_COLUMNS.map(([c]) => `u."${c}"`).join(', '))
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", ${cols}
      FROM "urls" u WHERE ${where}
      ORDER BY u."clicks" DESC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  return {
    links: rows.map((r) => ({
      id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl,
      clicks: Number(r.clicks), platforms: platformsOf(r),
    })),
    total: Number(counts[0]?.n ?? 0),
  }
}
