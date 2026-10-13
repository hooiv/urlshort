import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Traffic quality: how much of the raw click volume is human versus crawler or
 * AI-agent traffic, which AI agents are fetching links, and which links have a
 * suspiciously high non-human share (a common sign of link scanners, scraped
 * lists or click fraud). Human-only dashboards elsewhere hide this entirely.
 */
export const QUALITY_DAYS_OPTIONS = [1, 7, 14, 30, 90] as const
export const QUALITY_DEFAULT_DAYS = 7
export const QUALITY_MIN_LINK_CLICKS = 20
export const QUALITY_TOP_LIMIT = 10
const DAY_MS = 86_400_000

export function parseQualityDays(raw: string | null): number | null {
  if (raw === null || raw === '') return QUALITY_DEFAULT_DAYS
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (QUALITY_DAYS_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type TrafficTotals = { human: number; bot: number; ai_agent: number; total: number; nonHumanPercent: number }
export type SuspiciousLink = { id: string; shortCode: string; title: string | null; total: number; nonHuman: number; nonHumanPercent: number }
export type AiAgentRow = { agent: string; clicks: number }

export function summarizeTotals(rows: { trafficType: string; n: bigint | number }[]): TrafficTotals {
  const t = { human: 0, bot: 0, ai_agent: 0 }
  for (const r of rows) {
    if (r.trafficType === 'human' || r.trafficType === 'bot' || r.trafficType === 'ai_agent') t[r.trafficType] += Number(r.n)
  }
  const total = t.human + t.bot + t.ai_agent
  const nonHumanPercent = total === 0 ? 0 : Math.round(((t.bot + t.ai_agent) / total) * 1000) / 10
  return { ...t, total, nonHumanPercent }
}

type RawLink = { id: string; shortCode: string; title: string | null; total: bigint | number; nonhuman: bigint | number }

export function rankSuspicious(rows: RawLink[], minClicks = QUALITY_MIN_LINK_CLICKS, limit = QUALITY_TOP_LIMIT): SuspiciousLink[] {
  return rows
    .map((r) => {
      const total = Number(r.total)
      const nonHuman = Number(r.nonhuman)
      return { id: r.id, shortCode: r.shortCode, title: r.title, total, nonHuman, nonHumanPercent: total === 0 ? 0 : Math.round((nonHuman / total) * 1000) / 10 }
    })
    .filter((r) => r.total >= minClicks && r.nonHuman > 0)
    .sort((a, b) => b.nonHumanPercent - a.nonHumanPercent || b.nonHuman - a.nonHuman || a.shortCode.localeCompare(b.shortCode))
    .slice(0, limit)
}

export async function getTrafficQuality(scope: AnalyticsScope, days: number, now = new Date()) {
  const from = new Date(now.getTime() - days * DAY_MS)
  const window = Prisma.sql`c."createdAt" >= ${from} AND c."createdAt" <= ${now}`
  const [totalsRows, agentRows, linkRows, dailyRows] = await Promise.all([
    prisma.$queryRaw<{ trafficType: string; n: bigint }[]>(Prisma.sql`
      SELECT c."trafficType"::text AS "trafficType", COUNT(*) AS n
      FROM "click_events" c JOIN "urls" u ON u."id" = c."urlId"
      WHERE ${scopeFilter(scope)} AND ${window} GROUP BY 1`),
    prisma.$queryRaw<{ agent: string; n: bigint }[]>(Prisma.sql`
      SELECT c."aiAgent" AS agent, COUNT(*) AS n
      FROM "click_events" c JOIN "urls" u ON u."id" = c."urlId"
      WHERE ${scopeFilter(scope)} AND ${window} AND c."trafficType" = 'ai_agent' AND c."aiAgent" IS NOT NULL
      GROUP BY 1 ORDER BY n DESC, agent ASC LIMIT 10`),
    prisma.$queryRaw<RawLink[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", COUNT(*) AS total,
        COUNT(*) FILTER (WHERE c."trafficType" <> 'human') AS nonhuman
      FROM "click_events" c JOIN "urls" u ON u."id" = c."urlId"
      WHERE ${scopeFilter(scope)} AND ${window}
      GROUP BY u."id", u."shortCode", u."title"
      HAVING COUNT(*) >= ${QUALITY_MIN_LINK_CLICKS}`),
    prisma.$queryRaw<{ day: string; human: bigint; nonhuman: bigint }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', c."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
        COUNT(*) FILTER (WHERE c."trafficType" = 'human') AS human,
        COUNT(*) FILTER (WHERE c."trafficType" <> 'human') AS nonhuman
      FROM "click_events" c JOIN "urls" u ON u."id" = c."urlId"
      WHERE ${scopeFilter(scope)} AND ${window} GROUP BY 1 ORDER BY 1`),
  ])
  return {
    days,
    totals: summarizeTotals(totalsRows),
    aiAgents: agentRows.map((r): AiAgentRow => ({ agent: r.agent, clicks: Number(r.n) })),
    suspiciousLinks: rankSuspicious(linkRows),
    daily: dailyRows.map((r) => ({ day: r.day, human: Number(r.human), nonHuman: Number(r.nonhuman) })),
  }
}
