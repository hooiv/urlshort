import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
export const UTM_HYGIENE_MAX = 200
export const UTM_HYGIENE_DEFAULT = 50

export type UtmIssue = { key: string; value: string; suggested: string; reason: 'uppercase' | 'whitespace' | 'duplicate-key' }
export type UtmHygieneLink = { id: string; shortCode: string; title: string | null; originalUrl: string; fixedUrl: string; issues: UtmIssue[]; clicks: number; createdAt: string }

export function parseUtmHygieneLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return UTM_HYGIENE_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= UTM_HYGIENE_MAX ? n : null
}

/** Normalizes a UTM value: trimmed, lowercased, runs of whitespace become '-'. */
export function normalizeUtmValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

/**
 * Finds UTM values that fragment analytics ("Facebook" vs "facebook", "spring sale"
 * vs "spring-sale") and repeated utm keys. Returns null when the URL is invalid or clean.
 */
export function lintUtm(url: string): { fixedUrl: string; issues: UtmIssue[] } | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (!u.search) return null
  const issues: UtmIssue[] = []
  const seen = new Map<string, number>()
  const parts: string[] = []
  // Work on raw segments so untouched params keep their exact original encoding.
  for (const segment of u.search.slice(1).split('&')) {
    if (segment === '') continue
    const eq = segment.indexOf('=')
    const rawKey = eq === -1 ? segment : segment.slice(0, eq)
    const rawValue = eq === -1 ? '' : segment.slice(eq + 1)
    let key: string
    let value: string
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, ' '))
      value = decodeURIComponent(rawValue.replace(/\+/g, ' '))
    } catch { parts.push(segment); continue }
    const lower = key.toLowerCase()
    if (!(UTM_KEYS as readonly string[]).includes(lower)) { parts.push(segment); continue }
    const count = (seen.get(lower) ?? 0) + 1
    seen.set(lower, count)
    if (count > 1) { issues.push({ key: lower, value, suggested: '', reason: 'duplicate-key' }); continue }
    const fixed = normalizeUtmValue(value)
    if (key !== lower && fixed === value) issues.push({ key: lower, value, suggested: value, reason: 'uppercase' })
    else if (fixed !== value) {
      issues.push({ key: lower, value, suggested: fixed, reason: value.trim() !== value || /\s/.test(value) ? 'whitespace' : 'uppercase' })
    }
    parts.push(`${lower}=${encodeURIComponent(fixed)}`)
  }
  if (!issues.length) return null
  const out = new URL(u.toString())
  out.search = parts.length ? `?${parts.join('&')}` : ''
  return { fixedUrl: out.toString(), issues }
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: Date }

export async function findUtmHygieneLinks(scope: AnalyticsScope, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)} AND u."isActive" = true AND u."originalUrl" ~* 'utm_[a-z]+='`
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."createdAt"
    FROM "urls" u WHERE ${where}
    ORDER BY u."clicks" DESC, u."createdAt" ASC, u."shortCode" ASC
    LIMIT ${limit * 5}`)
  const links: UtmHygieneLink[] = []
  for (const r of rows) {
    const l = lintUtm(r.originalUrl)
    if (l) links.push({ ...r, ...l, createdAt: r.createdAt.toISOString() })
    if (links.length >= limit) break
  }
  return { links, count: links.length }
}
