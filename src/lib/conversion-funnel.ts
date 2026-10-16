import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Per-link conversion funnel: human clicks -> goal 1 -> goal 2 ... Each step counts only clicks that also
 * reached every earlier step (strict, click-attributed), so step counts never increase and drop-off is meaningful.
 */
export const FUNNEL_MAX_STEPS = 6
export const FUNNEL_WINDOW_OPTIONS = [7, 30, 90] as const
const DAY_MS = 86_400_000
const EVENT_KEY = /^[a-z0-9_]{1,64}$/

export function parseFunnelSteps(raw: string | null): string[] | null {
  if (!raw) return null
  const steps = raw.split(',').map((s) => s.trim())
  if (steps.length < 1 || steps.length > FUNNEL_MAX_STEPS) return null
  if (steps.some((s) => !EVENT_KEY.test(s))) return null
  if (new Set(steps).size !== steps.length) return null
  return steps
}

export function parseFunnelWindow(raw: string | null): number | null {
  if (raw === null || raw === '') return 30
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (FUNNEL_WINDOW_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type FunnelStep = {
  key: string
  count: number
  /** Share of the previous step that continued, null when the previous step is empty. */
  stepRatePct: number | null
  /** Share of all human clicks that reached this step. */
  overallRatePct: number | null
  dropOff: number
}

/** CSV rows for a shaped funnel: a leading "clicks" row then one row per step. */
export function funnelToCsvRows(f: { clicks: number; steps: FunnelStep[] }) {
  return [
    ['step', 'count', 'step_rate_pct', 'overall_rate_pct', 'drop_off'],
    ['clicks', f.clicks, '', '', ''],
    ...f.steps.map((s) => [s.key, s.count, s.stepRatePct ?? '', s.overallRatePct ?? '', s.dropOff]),
  ]
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)

export function shapeFunnel(clicks: number, steps: string[], counts: number[]): { clicks: number; steps: FunnelStep[] } {
  let previous = clicks
  const shaped = steps.map((key, i) => {
    // Enforce monotonic non-increasing counts even if data is inconsistent (e.g. clicks outside window).
    const count = Math.max(0, Math.min(Number(counts[i] ?? 0), previous))
    const step = { key, count, stepRatePct: pct(count, previous), overallRatePct: pct(count, clicks), dropOff: previous - count }
    previous = count
    return step
  })
  return { clicks, steps: shaped }
}

export async function getLinkFunnel(urlId: string, steps: string[], days: number, now = new Date()) {
  const start = new Date(now.getTime() - days * DAY_MS)
  const [clickRow] = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS n FROM "click_events"
    WHERE "urlId" = ${urlId} AND "trafficType" = 'human' AND "createdAt" >= ${start} AND "createdAt" < ${now}`)
  const clicks = Number(clickRow?.n ?? 0)
  // Click ids that reached each step, intersected progressively in SQL.
  const counts: number[] = []
  let ids: string[] | null = null
  for (const key of steps) {
    const rows: { id: string }[] = await prisma.$queryRaw(Prisma.sql`
      SELECT DISTINCT v."clickEventId" AS id
      FROM "conversion_events" v JOIN "goals" g ON g."id" = v."goalId"
      JOIN "click_events" c ON c."id" = v."clickEventId"
      WHERE v."urlId" = ${urlId} AND g."eventKey" = ${key} AND v."clickEventId" IS NOT NULL
        AND c."trafficType" = 'human' AND c."createdAt" >= ${start} AND c."createdAt" < ${now}
        ${ids ? Prisma.sql`AND v."clickEventId" IN (${Prisma.join(ids.length ? ids : [''])})` : Prisma.empty}`)
    ids = rows.map((r) => r.id)
    counts.push(ids.length)
  }
  return { days, from: start.toISOString(), to: now.toISOString(), ...shapeFunnel(clicks, steps, counts) }
}
