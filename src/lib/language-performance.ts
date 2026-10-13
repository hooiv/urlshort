import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter } from './aggregate-analytics'

/**
 * Language performance: human clicks and unique visitors per browser language (primary subtag of
 * Accept-Language, e.g. "en-GB" -> "en") in a workspace over a window versus the window of equal
 * length before it. Clicks with no usable language are reported as "Unknown" (language null).
 */
export const LANGUAGE_WINDOW_OPTIONS = [7, 30, 90] as const
export const LANGUAGE_DEFAULT_WINDOW = 30
export const LANGUAGE_MAX_ROWS = 250
const DAY_MS = 86_400_000

export function parseLanguageWindow(raw: string | null): number | null {
  if (raw === null || raw === '') return LANGUAGE_DEFAULT_WINDOW
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (LANGUAGE_WINDOW_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type LanguageStat = {
  language: string | null
  name: string
  clicks: number
  visitors: number
  previousClicks: number
  changePct: number | null
  sharePct: number
}

type RawRow = { language: string | null; clicks: bigint | number; visitors: bigint | number; previous: bigint | number }

/** Primary language subtag (2-3 letters, lowercase) or null for empty / malformed / wildcard values. */
export function primaryLanguage(raw: string | null | undefined): string | null {
  if (!raw) return null
  const first = raw.split(',')[0]?.split(';')[0]?.trim() ?? ''
  const m = /^([A-Za-z]{2,3})(?:[-_][A-Za-z0-9]{1,8})*$/.exec(first)
  return m ? m[1].toLowerCase() : null
}

export function languageName(code: string | null): string {
  if (!code) return 'Unknown'
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

export function shapeLanguageStats(rows: RawRow[]): LanguageStat[] {
  const merged = new Map<string, { language: string | null; clicks: number; visitors: number; previousClicks: number }>()
  for (const r of rows) {
    const code = primaryLanguage(r.language)
    const key = code ?? '\u0000unknown'
    const cur = merged.get(key) ?? { language: code, clicks: 0, visitors: 0, previousClicks: 0 }
    cur.clicks += Number(r.clicks)
    // Visitors are distinct per raw value; summing across variants can overcount a visitor who
    // sent two variants, so cap at clicks.
    cur.visitors += Number(r.visitors)
    cur.previousClicks += Number(r.previous)
    merged.set(key, cur)
  }
  const parsed = [...merged.values()].map((r) => ({ ...r, visitors: Math.min(r.visitors, r.clicks) }))
  const total = parsed.reduce((s, r) => s + r.clicks, 0)
  return parsed
    .map((r) => ({
      ...r,
      name: languageName(r.language),
      changePct: r.previousClicks > 0 ? Math.round(((r.clicks - r.previousClicks) / r.previousClicks) * 1000) / 10 : null,
      sharePct: total > 0 ? Math.round((r.clicks / total) * 1000) / 10 : 0,
    }))
    .filter((r) => r.clicks > 0 || r.previousClicks > 0)
    .sort((a, b) => b.clicks - a.clicks || a.name.localeCompare(b.name))
}

export async function getLanguagePerformance(
  workspaceId: string,
  viewer: { userId: string } | undefined,
  days: number,
  now = new Date(),
) {
  const end = now
  const start = new Date(end.getTime() - days * DAY_MS)
  const prevStart = new Date(start.getTime() - days * DAY_MS)
  // Group by the lowercased primary subtag in SQL so the row count stays small.
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT LOWER(SUBSTRING(c."language" FROM '^[A-Za-z]{2,3}')) AS "language",
      COUNT(*) FILTER (WHERE c."createdAt" >= ${start}) AS "clicks",
      COUNT(DISTINCT c."visitorIdHash") FILTER (WHERE c."createdAt" >= ${start}) AS "visitors",
      COUNT(*) FILTER (WHERE c."createdAt" < ${start}) AS "previous"
    FROM "click_events" c
    JOIN "urls" u ON u."id" = c."urlId"
    WHERE c."trafficType" = 'human' AND c."createdAt" >= ${prevStart} AND c."createdAt" < ${end}
      AND ${scopeFilter({ kind: 'workspace', workspaceId, viewer })}
    GROUP BY 1
    ORDER BY "clicks" DESC
    LIMIT ${LANGUAGE_MAX_ROWS}`)
  return { days, from: start.toISOString(), to: end.toISOString(), languages: shapeLanguageStats(rows) }
}
