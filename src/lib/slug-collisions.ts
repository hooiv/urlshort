import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Short codes are case-sensitive, so "Promo" and "promo" can both exist and point
 * at different places. People type and read links aloud case-insensitively, so such
 * pairs send traffic to the wrong destination. This groups links whose codes differ
 * only by case (or by look-alike separators) so owners can merge or rename them.
 */
export const SLUG_COLLISIONS_MAX = 100
export const SLUG_COLLISIONS_DEFAULT = 50

export type CollidingLink = { id: string; shortCode: string; originalUrl: string; clicks: number }
export type SlugCollisionGroup = { key: string; sameDestination: boolean; links: CollidingLink[] }

export function parseSlugCollisionsLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return SLUG_COLLISIONS_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= SLUG_COLLISIONS_MAX ? n : null
}

/** Canonical comparison key: lowercase, with '-' and '_' ignored. */
export function slugCollisionKey(shortCode: string): string {
  return shortCode.toLowerCase().replace(/[-_]/g, '')
}

/** Pure grouping: groups of 2+ links sharing a key, busiest group first. */
export function groupSlugCollisions(links: CollidingLink[]): SlugCollisionGroup[] {
  const byKey = new Map<string, CollidingLink[]>()
  for (const l of links) {
    const key = slugCollisionKey(l.shortCode)
    const list = byKey.get(key)
    if (list) list.push(l)
    else byKey.set(key, [l])
  }
  const groups: SlugCollisionGroup[] = []
  for (const [key, list] of byKey) {
    if (list.length < 2) continue
    list.sort((a, b) => b.clicks - a.clicks || a.shortCode.localeCompare(b.shortCode))
    groups.push({ key, sameDestination: new Set(list.map((l) => l.originalUrl)).size === 1, links: list })
  }
  const weight = (g: SlugCollisionGroup) => g.links.reduce((s, l) => s + l.clicks, 0)
  return groups.sort((a, b) => weight(b) - weight(a) || a.key.localeCompare(b.key))
}

export async function findSlugCollisions(scope: AnalyticsScope, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)}`
  // The CTE scopes once; only codes whose canonical key repeats leave the database.
  const rows = await prisma.$queryRaw<CollidingLink[]>(Prisma.sql`
    WITH scoped AS (
      SELECT u."id", u."shortCode", u."originalUrl", u."clicks",
             translate(lower(u."shortCode"), '-_', '') AS k
      FROM "urls" u WHERE ${where}
    )
    SELECT "id", "shortCode", "originalUrl", "clicks" FROM scoped
    WHERE k IN (SELECT k FROM scoped GROUP BY k HAVING COUNT(*) > 1)`)
  const groups = groupSlugCollisions(rows.map((r) => ({ ...r, clicks: Number(r.clicks) })))
  return { groups: groups.slice(0, limit), total: groups.length }
}
