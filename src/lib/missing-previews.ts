import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Missing social previews: active links with no custom preview image,
 * title or description, most-clicked first, listing which fields are absent.
 */
export const MISSING_PREVIEW_MAX = 200
export const MISSING_PREVIEW_DEFAULT = 50

export type PreviewField = 'title' | 'description' | 'image'
export type MissingPreviewLink = { id: string; shortCode: string; originalUrl: string; clicks: number; missing: PreviewField[] }

export function parseMissingPreviewLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return MISSING_PREVIEW_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= MISSING_PREVIEW_MAX ? n : null
}

const blank = (v: string | null) => v === null || v.trim() === ''

export function missingPreviewFields(l: { title: string | null; description: string | null; ogImage: string | null }): PreviewField[] {
  const out: PreviewField[] = []
  if (blank(l.title)) out.push('title')
  if (blank(l.description)) out.push('description')
  if (blank(l.ogImage)) out.push('image')
  return out
}

type Row = { id: string; shortCode: string; originalUrl: string; clicks: number; title: string | null; description: string | null; ogImage: string | null }

export async function findMissingPreviews(scope: AnalyticsScope, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)} AND u."isActive" = true`
  const incomplete = Prisma.sql`(u."ogImage" IS NULL OR btrim(u."ogImage") = '' OR u."title" IS NULL OR btrim(u."title") = '' OR u."description" IS NULL OR btrim(u."description") = '')`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."originalUrl", u."clicks", u."title", u."description", u."ogImage"
      FROM "urls" u WHERE ${where} AND ${incomplete}
      ORDER BY u."clicks" DESC, u."createdAt" ASC, u."shortCode" ASC
      LIMIT ${limit}`),
    prisma.$queryRaw<{ total: bigint; incomplete: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE ${incomplete}) AS incomplete
      FROM "urls" u WHERE ${where}`),
  ])
  const links: MissingPreviewLink[] = rows.map((r) => ({
    id: r.id, shortCode: r.shortCode, originalUrl: r.originalUrl, clicks: r.clicks, missing: missingPreviewFields(r),
  }))
  return { links, total: Number(counts[0]?.total ?? 0), incomplete: Number(counts[0]?.incomplete ?? 0) }
}
