import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'
import { SPIKE_BASELINE_DAYS } from './click-spikes'

/**
 * Click drops: the mirror of click spikes. Links that normally get steady human
 * traffic but whose recent window fell far below their own baseline, which
 * usually means a broken campaign, a dead destination or a removed placement.
 * A baseline floor keeps low-traffic links (where zero is normal) out.
 */
export const DROP_MIN_BASELINE = 20
export const DROP_MAX_RATIO = 0.4
const HOUR_MS = 3_600_000

export type ClickDrop = {
  id: string
  shortCode: string
  title: string | null
  originalUrl: string
  recentClicks: number
  baselinePerWindow: number
  /** recent / baseline, 0 when the link went completely silent. */
  ratio: number
  severity: 'dip' | 'drop' | 'silent'
}

export function classifyDrop(recent: number, baselinePerWindow: number): ClickDrop['severity'] | null {
  if (baselinePerWindow < DROP_MIN_BASELINE) return null
  if (recent === 0) return 'silent'
  const ratio = recent / baselinePerWindow
  if (ratio > DROP_MAX_RATIO) return null
  return ratio <= 0.15 ? 'drop' : 'dip'
}

type RawRow = { id: string; shortCode: string; title: string | null; originalUrl: string; recent: bigint | number; baseline: bigint | number }

export function shapeDrops(rows: RawRow[], windowHours: number): ClickDrop[] {
  const windows = (SPIKE_BASELINE_DAYS * 24) / windowHours
  const out: ClickDrop[] = []
  for (const r of rows) {
    const recent = Number(r.recent)
    const baselinePerWindow = Number(r.baseline) / windows
    const severity = classifyDrop(recent, baselinePerWindow)
    if (!severity) continue
    out.push({
      id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl,
      recentClicks: recent,
      baselinePerWindow: Math.round(baselinePerWindow * 10) / 10,
      ratio: Math.round((recent / baselinePerWindow) * 100) / 100,
      severity,
    })
  }
  // Biggest lost traffic first.
  return out.sort((a, b) => (b.baselinePerWindow - b.recentClicks) - (a.baselinePerWindow - a.recentClicks) || a.shortCode.localeCompare(b.shortCode))
}

export async function getClickDrops(scope: AnalyticsScope, opts: { windowHours: number; limit: number }, now = new Date()) {
  const recentStart = new Date(now.getTime() - opts.windowHours * HOUR_MS)
  const baseStart = new Date(recentStart.getTime() - SPIKE_BASELINE_DAYS * 24 * HOUR_MS)
  const minBaselineTotal = Math.ceil(DROP_MIN_BASELINE * ((SPIKE_BASELINE_DAYS * 24) / opts.windowHours))
  // Aggregate over the baseline first, so links that went fully silent (no recent rows) still appear.
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", u."originalUrl",
      COUNT(*) FILTER (WHERE c."createdAt" >= ${recentStart}) AS "recent",
      COUNT(*) FILTER (WHERE c."createdAt" < ${recentStart}) AS "baseline"
    FROM "urls" u
    JOIN "click_events" c ON c."urlId" = u."id"
    WHERE ${scopeFilter(scope)} AND u."isActive" = true
      AND c."trafficType" = 'human' AND c."createdAt" >= ${baseStart} AND c."createdAt" <= ${now}
    GROUP BY u."id"
    HAVING COUNT(*) FILTER (WHERE c."createdAt" < ${recentStart}) >= ${minBaselineTotal}
    LIMIT 2000`)
  const drops = shapeDrops(rows, opts.windowHours)
  return { windowHours: opts.windowHours, baselineDays: SPIKE_BASELINE_DAYS, truncated: drops.length > opts.limit, drops: drops.slice(0, opts.limit) }
}
