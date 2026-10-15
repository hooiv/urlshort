import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Click concentration (Pareto): how much of the human traffic over the period
 * comes from the top few links. Answers "is my traffic one viral link or a
 * healthy portfolio?" with the share held by the top 1/5/10 links, the number
 * of links that make up 80% of clicks, and a Gini coefficient.
 */
export const CONCENTRATION_PERIOD_OPTIONS = [7, 30, 90] as const
export const CONCENTRATION_DEFAULT_DAYS = 30
export const CONCENTRATION_TOP_N = [1, 5, 10] as const

export function parseConcentrationDays(raw: string | null): number | null {
  if (raw === null || raw === '') return CONCENTRATION_DEFAULT_DAYS
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (CONCENTRATION_PERIOD_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type ConcentrationLink = { id: string; shortCode: string; title: string | null; clicks: number; share: number }
export type Concentration = {
  days: number
  totalClicks: number
  linkCount: number
  topShares: { top: number; share: number }[]
  linksFor80Percent: number
  gini: number
  level: 'none' | 'diversified' | 'moderate' | 'concentrated'
  top: ConcentrationLink[]
}

const round = (n: number, p = 1000) => Math.round(n * p) / p

/** Gini over click counts (0 = perfectly even, ->1 = one link has everything). */
export function giniCoefficient(counts: number[]): number {
  const n = counts.length
  const total = counts.reduce((a, b) => a + b, 0)
  if (n < 2 || total === 0) return 0
  const asc = [...counts].sort((a, b) => a - b)
  let weighted = 0
  asc.forEach((v, i) => { weighted += (i + 1) * v })
  return Math.max(0, (2 * weighted) / (n * total) - (n + 1) / n)
}

export function shapeConcentration(
  rows: { id: string; shortCode: string; title: string | null; clicks: number | bigint }[],
  days: number,
  topLimit = 10,
): Concentration {
  const links = rows.map((r) => ({ ...r, clicks: Number(r.clicks) })).filter((r) => r.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks || a.shortCode.localeCompare(b.shortCode))
  const total = links.reduce((a, r) => a + r.clicks, 0)
  if (total === 0) return { days, totalClicks: 0, linkCount: 0, topShares: CONCENTRATION_TOP_N.map((top) => ({ top, share: 0 })), linksFor80Percent: 0, gini: 0, level: 'none', top: [] }
  const topShares = CONCENTRATION_TOP_N.map((top) => ({ top, share: round(links.slice(0, top).reduce((a, r) => a + r.clicks, 0) / total) }))
  let run = 0
  let linksFor80Percent = 0
  for (const l of links) { run += l.clicks; linksFor80Percent++; if (run / total >= 0.8) break }
  const gini = round(giniCoefficient(links.map((l) => l.clicks)))
  const lead = topShares[0].share
  const level = links.length === 1 || lead >= 0.6 ? 'concentrated' : lead >= 0.3 || gini >= 0.6 ? 'moderate' : 'diversified'
  return {
    days, totalClicks: total, linkCount: links.length, topShares, linksFor80Percent, gini, level,
    top: links.slice(0, topLimit).map((l) => ({ id: l.id, shortCode: l.shortCode, title: l.title, clicks: l.clicks, share: round(l.clicks / total) })),
  }
}

export async function getClickConcentration(scope: AnalyticsScope, days: number, now = new Date()): Promise<Concentration> {
  const since = new Date(now.getTime() - days * 86_400_000)
  const rows = await prisma.$queryRaw<{ id: string; shortCode: string; title: string | null; clicks: bigint }[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", COUNT(*) AS "clicks"
    FROM "urls" u
    JOIN "click_events" c ON c."urlId" = u."id"
    WHERE ${scopeFilter(scope)} AND u."deletedAt" IS NULL
      AND c."trafficType" = 'human' AND c."createdAt" >= ${since} AND c."createdAt" <= ${now}
    GROUP BY u."id"
    ORDER BY COUNT(*) DESC
    LIMIT 5000`)
  return shapeConcentration(rows, days)
}
