import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Per-link UTM breakdown: human clicks grouped by one UTM dimension, with a
 * "(none)" bucket for clicks that carried no value. Grouping runs in Postgres
 * on the (urlId, createdAt) index; the dimension is chosen from a closed
 * whitelist so it can never reach SQL as user text.
 */

export const UTM_DIMENSIONS = ['source', 'medium', 'campaign', 'term', 'content'] as const
export type UtmDimension = (typeof UTM_DIMENSIONS)[number]
export const UTM_MAX_DAYS = 365
export const UTM_DEFAULT_DAYS = 30
export const UTM_MAX_LIMIT = 50
export const UTM_DEFAULT_LIMIT = 10
export const UTM_NONE = '(none)'
const DAY_MS = 86_400_000

const COLUMN: Record<UtmDimension, string> = {
  source: 'utmSource', medium: 'utmMedium', campaign: 'utmCampaign', term: 'utmTerm', content: 'utmContent',
}

export type UtmRow = { value: string; clicks: number; share: number }
export type UtmBreakdown = { dimension: UtmDimension; days: number; total: number; rows: UtmRow[]; otherClicks: number }

export function parseUtmDimension(raw: string | null): UtmDimension | null {
  if (raw === null || raw === '') return 'source'
  return (UTM_DIMENSIONS as readonly string[]).includes(raw) ? (raw as UtmDimension) : null
}

function parseBoundedInt(raw: string | null, def: number, max: number): number | null {
  if (raw === null || raw === '') return def
  if (!/^\d{1,4}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= max ? n : null
}
export const parseUtmDays = (raw: string | null) => parseBoundedInt(raw, UTM_DEFAULT_DAYS, UTM_MAX_DAYS)
export const parseUtmLimit = (raw: string | null) => parseBoundedInt(raw, UTM_DEFAULT_LIMIT, UTM_MAX_LIMIT)

/** Pure: rank grouped rows, keep the top `limit`, fold the rest into otherClicks, compute share of total. */
export function buildUtmBreakdown(
  raw: Array<{ value: string | null; clicks: number }>, dimension: UtmDimension, days: number, limit: number,
): UtmBreakdown {
  const merged = new Map<string, number>()
  for (const { value, clicks } of raw) {
    if (!Number.isFinite(clicks) || clicks <= 0) continue
    const key = value && value.trim() ? value.trim() : UTM_NONE
    merged.set(key, (merged.get(key) ?? 0) + clicks)
  }
  const sorted = [...merged].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const total = sorted.reduce((s, [, c]) => s + c, 0)
  const top = sorted.slice(0, limit)
  const shown = top.reduce((s, [, c]) => s + c, 0)
  return {
    dimension, days, total,
    rows: top.map(([value, clicks]) => ({ value, clicks, share: total ? Math.round((clicks / total) * 1000) / 10 : 0 })),
    otherClicks: total - shown,
  }
}

export async function getUtmBreakdown(urlId: string, dimension: UtmDimension, days: number, limit: number, now = new Date()): Promise<UtmBreakdown> {
  const since = new Date(now.getTime() - days * DAY_MS)
  const col = Prisma.raw(`"${COLUMN[dimension]}"`)
  const rows = await prisma.$queryRaw<Array<{ value: string | null; clicks: bigint }>>(Prisma.sql`
    SELECT ${col} AS value, COUNT(*) AS clicks
    FROM "click_events"
    WHERE "urlId" = ${urlId} AND "createdAt" >= ${since} AND "createdAt" <= ${now} AND "trafficType" = 'human'
    GROUP BY 1`)
  return buildUtmBreakdown(rows.map((r) => ({ value: r.value, clicks: Number(r.clicks) })), dimension, days, limit)
}
