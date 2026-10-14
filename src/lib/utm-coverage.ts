import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * UTM coverage audit: active links whose destination is missing one or more
 * of utm_source / utm_medium / utm_campaign, so campaign reporting has gaps.
 * Fix them in bulk via /api/bulk/edit with a UTM template.
 */
export const UTM_REQUIRED = ['utm_source', 'utm_medium', 'utm_campaign'] as const
export const UTM_COVERAGE_MAX_LIMIT = 200
export const UTM_COVERAGE_DEFAULT_LIMIT = 50

export function parseCoverageLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return UTM_COVERAGE_DEFAULT_LIMIT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= UTM_COVERAGE_MAX_LIMIT ? n : null
}

/** Pure: which required UTM params are absent or empty on a destination URL. */
export function missingUtmParams(url: string): string[] {
  let params: URLSearchParams
  try { params = new URL(url).searchParams } catch { return [...UTM_REQUIRED] }
  return UTM_REQUIRED.filter((k) => !(params.get(k) ?? '').trim())
}

export type UtmCoverageLink = { id: string; shortCode: string; title: string | null; originalUrl: string; missing: string[] }

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string }

export function shapeCoverage(rows: Row[]): UtmCoverageLink[] {
  const out: UtmCoverageLink[] = []
  for (const r of rows) {
    const missing = missingUtmParams(r.originalUrl)
    if (missing.length) out.push({ ...r, missing })
  }
  return out
}

export async function getUtmCoverage(scope: AnalyticsScope, opts: { limit: number }) {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", u."originalUrl"
    FROM "urls" u
    WHERE ${scopeFilter(scope)} AND u."isActive" = true
    ORDER BY u."createdAt" DESC, u."id" ASC`)
  const gaps = shapeCoverage(rows)
  const total = rows.length
  const complete = total - gaps.length
  return {
    totalLinks: total,
    tagged: complete,
    coveragePercent: total === 0 ? 100 : Math.round((complete / total) * 1000) / 10,
    truncated: gaps.length > opts.limit,
    links: gaps.slice(0, opts.limit),
  }
}
