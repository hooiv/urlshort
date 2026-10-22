import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Plain-language insights for one link, derived from the last N days of human clicks.
 * Every insight is rule-based and carries the numbers it rests on, so it is auditable.
 */
export const INSIGHT_DEFAULT_DAYS = 30
export const INSIGHT_MAX_DAYS = 90
const DAY_MS = 86_400_000
const MIN_CLICKS = 20

export function parseInsightDays(raw: string | null): number | null {
  if (raw === null || raw === '') return INSIGHT_DEFAULT_DAYS
  if (!/^\d{1,2}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 7 && n <= INSIGHT_MAX_DAYS ? n : null
}

export type Share = { key: string; clicks: number }
export type InsightInput = {
  days: number
  dailyClicks: number[] // oldest -> newest, length === days
  countries: Share[]
  devices: Share[]
  referrers: Share[]
  bots: number
  humans: number
}
export type Insight = { id: string; severity: 'info' | 'positive' | 'warning'; message: string; data: Record<string, number | string> }

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10)

function top(list: Share[]): Share | null {
  let best: Share | null = null
  for (const s of list) if (!best || s.clicks > best.clicks || (s.clicks === best.clicks && s.key < best.key)) best = s
  return best
}

export function buildInsights(input: InsightInput): Insight[] {
  const out: Insight[] = []
  const total = input.dailyClicks.reduce((a, b) => a + b, 0)
  const all = input.humans + input.bots
  if (all >= MIN_CLICKS && pct(input.bots, all) >= 30) {
    out.push({ id: 'bot-heavy', severity: 'warning', message: `${pct(input.bots, all)}% of traffic is automated; human counts are reported separately.`, data: { botPercent: pct(input.bots, all), bots: input.bots } })
  }
  if (total < MIN_CLICKS) {
    out.push({ id: 'low-volume', severity: 'info', message: `Only ${total} human clicks in ${input.days} days; not enough for reliable trends.`, data: { clicks: total } })
    return out
  }
  // Momentum: last half vs first half.
  const half = Math.floor(input.days / 2)
  const prev = input.dailyClicks.slice(0, half).reduce((a, b) => a + b, 0)
  const recent = input.dailyClicks.slice(input.days - half).reduce((a, b) => a + b, 0)
  if (prev >= 10) {
    const change = pct(recent - prev, prev)
    if (change >= 25) out.push({ id: 'growing', severity: 'positive', message: `Clicks are up ${change}% over the last ${half} days versus the ${half} before.`, data: { change, recent, previous: prev } })
    else if (change <= -25) out.push({ id: 'declining', severity: 'warning', message: `Clicks are down ${Math.abs(change)}% over the last ${half} days versus the ${half} before.`, data: { change, recent, previous: prev } })
  } else if (prev < 10 && recent >= 20) {
    out.push({ id: 'new-traction', severity: 'positive', message: `Picked up ${recent} clicks in the last ${half} days after a quiet start.`, data: { recent, previous: prev } })
  }
  // Single-day concentration (viral burst).
  let peakIdx = 0
  input.dailyClicks.forEach((c, i) => { if (c > input.dailyClicks[peakIdx]) peakIdx = i })
  const peak = input.dailyClicks[peakIdx]
  if (pct(peak, total) >= 50) out.push({ id: 'single-day-burst', severity: 'info', message: `${pct(peak, total)}% of clicks came on one day (${peak} clicks).`, data: { peak, daysAgo: input.days - 1 - peakIdx } })
  const humans = input.humans || total
  const c = top(input.countries)
  if (c && pct(c.clicks, humans) >= 60) out.push({ id: 'country-concentrated', severity: 'info', message: `${pct(c.clicks, humans)}% of clicks come from ${c.key}; consider geo-targeting there.`, data: { country: c.key, percent: pct(c.clicks, humans) } })
  const d = top(input.devices)
  if (d && pct(d.clicks, humans) >= 70) out.push({ id: 'device-skew', severity: 'info', message: `${pct(d.clicks, humans)}% of clicks are on ${d.key}; make sure the destination is optimised for it.`, data: { device: d.key, percent: pct(d.clicks, humans) } })
  const r = top(input.referrers.filter((x) => x.key !== ''))
  if (r && pct(r.clicks, humans) >= 50) out.push({ id: 'referrer-dependent', severity: 'info', message: `${pct(r.clicks, humans)}% of clicks are referred by ${r.key}; losing that source would hit hard.`, data: { referrer: r.key, percent: pct(r.clicks, humans) } })
  return out
}

export async function getLinkInsights(urlId: string, days: number, now = new Date()) {
  const since = new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS - (days - 1) * DAY_MS)
  const [daily, countries, devices, referrers, traffic] = await Promise.all([
    prisma.$queryRaw<{ day: Date; n: bigint }[]>(Prisma.sql`SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day, COUNT(*) AS n FROM "click_events" WHERE "urlId" = ${urlId} AND "trafficType" = 'human' AND "createdAt" >= ${since} GROUP BY 1`),
    prisma.$queryRaw<{ key: string | null; n: bigint }[]>(Prisma.sql`SELECT "country" AS key, COUNT(*) AS n FROM "click_events" WHERE "urlId" = ${urlId} AND "trafficType" = 'human' AND "createdAt" >= ${since} AND "country" IS NOT NULL GROUP BY 1`),
    prisma.$queryRaw<{ key: string | null; n: bigint }[]>(Prisma.sql`SELECT "deviceType"::text AS key, COUNT(*) AS n FROM "click_events" WHERE "urlId" = ${urlId} AND "trafficType" = 'human' AND "createdAt" >= ${since} AND "deviceType" IS NOT NULL GROUP BY 1`),
    prisma.$queryRaw<{ key: string | null; n: bigint }[]>(Prisma.sql`SELECT "referrerHost" AS key, COUNT(*) AS n FROM "click_events" WHERE "urlId" = ${urlId} AND "trafficType" = 'human' AND "createdAt" >= ${since} AND "referrerHost" IS NOT NULL GROUP BY 1`),
    prisma.$queryRaw<{ t: string; n: bigint }[]>(Prisma.sql`SELECT "trafficType"::text AS t, COUNT(*) AS n FROM "click_events" WHERE "urlId" = ${urlId} AND "createdAt" >= ${since} GROUP BY 1`),
  ])
  const dailyClicks = new Array<number>(days).fill(0)
  for (const r of daily) {
    const idx = Math.round((new Date(r.day).getTime() - since.getTime()) / DAY_MS)
    if (idx >= 0 && idx < days) dailyClicks[idx] = Number(r.n)
  }
  const shares = (rows: { key: string | null; n: bigint }[]): Share[] => rows.map((r) => ({ key: r.key ?? '', clicks: Number(r.n) }))
  const humans = traffic.filter((t) => t.t === 'human').reduce((a, t) => a + Number(t.n), 0)
  const bots = traffic.filter((t) => t.t !== 'human').reduce((a, t) => a + Number(t.n), 0)
  const insights = buildInsights({ days, dailyClicks, countries: shares(countries), devices: shares(devices), referrers: shares(referrers), humans, bots })
  return { days, humanClicks: humans, insights }
}
