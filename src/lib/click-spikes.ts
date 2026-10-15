import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Click spikes: links whose human clicks in the recent window run far above
 * their own daily baseline (the prior BASELINE_DAYS days). Surfaces viral
 * moments and suspicious floods early. A minimum click floor keeps tiny links
 * from flagging on 1 -> 3 clicks.
 */
export const SPIKE_BASELINE_DAYS = 14
export const SPIKE_WINDOW_HOURS_OPTIONS = [6, 24, 72] as const
export const SPIKE_DEFAULT_WINDOW_HOURS = 24
export const SPIKE_MIN_CLICKS = 20
export const SPIKE_MIN_RATIO = 3
export const SPIKE_MAX_LIMIT = 100
export const SPIKE_DEFAULT_LIMIT = 25
const HOUR_MS = 3_600_000

export function parseSpikeWindow(raw: string | null): number | null {
  if (raw === null || raw === '') return SPIKE_DEFAULT_WINDOW_HOURS
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (SPIKE_WINDOW_HOURS_OPTIONS as readonly number[]).includes(n) ? n : null
}

export function parseSpikeLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return SPIKE_DEFAULT_LIMIT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= SPIKE_MAX_LIMIT ? n : null
}

export type ClickSpike = {
  id: string
  shortCode: string
  title: string | null
  originalUrl: string
  recentClicks: number
  baselinePerWindow: number
  /** recent / baseline; null when the link had no baseline traffic at all. */
  ratio: number | null
  severity: 'notice' | 'surge' | 'viral'
}

export function classifySpike(recent: number, baselinePerWindow: number): ClickSpike['severity'] | null {
  if (recent < SPIKE_MIN_CLICKS) return null
  // A floor of one click per window avoids dividing by zero for brand-new traffic.
  const ratio = recent / Math.max(baselinePerWindow, 1)
  if (ratio < SPIKE_MIN_RATIO) return null
  if (ratio >= 20) return 'viral'
  if (ratio >= 8) return 'surge'
  return 'notice'
}

type RawRow = { id: string; shortCode: string; title: string | null; originalUrl: string; recent: bigint | number; baseline: bigint | number }

/** Pure: turn raw counts into ranked spikes. baseline is the click count over SPIKE_BASELINE_DAYS. */
export function shapeSpikes(rows: RawRow[], windowHours: number): ClickSpike[] {
  const windows = (SPIKE_BASELINE_DAYS * 24) / windowHours
  const out: ClickSpike[] = []
  for (const r of rows) {
    const recent = Number(r.recent)
    const baselinePerWindow = Number(r.baseline) / windows
    const severity = classifySpike(recent, baselinePerWindow)
    if (!severity) continue
    out.push({
      id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl,
      recentClicks: recent,
      baselinePerWindow: Math.round(baselinePerWindow * 10) / 10,
      ratio: Number(r.baseline) === 0 ? null : Math.round((recent / Math.max(baselinePerWindow, 1)) * 10) / 10,
      severity,
    })
  }
  return out.sort((a, b) => b.recentClicks / Math.max(b.baselinePerWindow, 1) - a.recentClicks / Math.max(a.baselinePerWindow, 1) || a.shortCode.localeCompare(b.shortCode))
}

export async function getClickSpikes(scope: AnalyticsScope, opts: { windowHours: number; limit: number }, now = new Date()) {
  const recentStart = new Date(now.getTime() - opts.windowHours * HOUR_MS)
  const baseStart = new Date(recentStart.getTime() - SPIKE_BASELINE_DAYS * 24 * HOUR_MS)
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", u."originalUrl",
      COUNT(*) FILTER (WHERE c."createdAt" >= ${recentStart}) AS "recent",
      COUNT(*) FILTER (WHERE c."createdAt" < ${recentStart}) AS "baseline"
    FROM "urls" u
    JOIN "click_events" c ON c."urlId" = u."id"
    WHERE ${scopeFilter(scope)} AND u."isActive" = true
      AND c."trafficType" = 'human' AND c."createdAt" >= ${baseStart} AND c."createdAt" <= ${now}
    GROUP BY u."id"
    HAVING COUNT(*) FILTER (WHERE c."createdAt" >= ${recentStart}) >= ${SPIKE_MIN_CLICKS}
    LIMIT 2000`)
  const spikes = shapeSpikes(rows, opts.windowHours)
  return { windowHours: opts.windowHours, baselineDays: SPIKE_BASELINE_DAYS, truncated: spikes.length > opts.limit, spikes: spikes.slice(0, opts.limit) }
}
