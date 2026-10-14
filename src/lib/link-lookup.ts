import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'
import { normalizeDestination } from './duplicate-links'

/**
 * Destination lookup ("does a short link for this URL already exist?"), the
 * building block for idempotent create flows. A candidate set is narrowed in
 * SQL by host, then compared on the normalised destination so
 * `https://www.Example.com/a/?utm_source=x` finds `https://example.com/a`.
 * `exact` marks links whose stored URL is byte-identical to the query.
 */
export const LOOKUP_MAX_RESULTS = 20
const LOOKUP_MAX_CANDIDATES = 500

export type LookupMatch = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; isActive: boolean; createdAt: string; exact: boolean }

export function validateLookupUrl(raw: string | null): { ok: true; url: string; host: string } | { ok: false; error: string } {
  if (!raw || !raw.trim()) return { ok: false, error: 'url is required' }
  if (raw.length > 2048) return { ok: false, error: 'url is too long' }
  let u: URL
  try { u = new URL(raw.trim()) } catch { return { ok: false, error: 'url must be a valid http(s) URL' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'url must be a valid http(s) URL' }
  return { ok: true, url: raw.trim(), host: u.hostname.toLowerCase().replace(/^www\./, '') }
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; isActive: boolean; createdAt: Date }

/** Pure ranking: exact matches first, then active, then most clicks, then oldest. */
export function matchDestination(rows: Row[], query: string, limit = LOOKUP_MAX_RESULTS): LookupMatch[] {
  const want = normalizeDestination(query)
  if (!want) return []
  return rows
    .filter((r) => normalizeDestination(r.originalUrl) === want)
    .map((r) => ({ id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl, clicks: r.clicks, isActive: r.isActive, createdAt: r.createdAt.toISOString(), exact: r.originalUrl === query }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.isActive) - Number(a.isActive) || b.clicks - a.clicks || a.createdAt.localeCompare(b.createdAt) || a.shortCode.localeCompare(b.shortCode))
    .slice(0, limit)
}

function escapeLike(s: string) { return s.replace(/[\\%_]/g, (c) => `\\${c}`) }

export async function lookupLinksByDestination(scope: AnalyticsScope, rawUrl: string) {
  const checked = validateLookupUrl(rawUrl)
  if (!checked.ok) throw new Error(checked.error)
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."isActive", u."createdAt"
    FROM "urls" u
    WHERE ${scopeFilter(scope)} AND u."originalUrl" ILIKE ${`%${escapeLike(checked.host)}%`}
    ORDER BY u."createdAt" DESC
    LIMIT ${LOOKUP_MAX_CANDIDATES}`)
  const matches = matchDestination(rows, checked.url)
  return { matches, found: matches.length > 0, truncated: rows.length >= LOOKUP_MAX_CANDIDATES }
}
