import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * QR scan analytics: clicks whose utm_medium is "qr" (what the QR designer's
 * track=1 option stamps on the encoded URL). Reports the scan share of all
 * traffic, a daily series and the links whose printed codes get scanned most,
 * so owners can tell if a poster or packaging code earns its place.
 */
export const QR_DAYS_OPTIONS = [1, 7, 14, 30, 90] as const
export const QR_DEFAULT_DAYS = 30
export const QR_TOP_LIMIT = 10

export function parseQrDays(raw: string | null): number | null {
  if (raw === null || raw === '') return QR_DEFAULT_DAYS
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (QR_DAYS_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type QrTopLink = { id: string; shortCode: string; title: string | null; scans: number; totalClicks: number; scanPercent: number }
export type QrScanReport = {
  days: number
  totals: { scans: number; clicks: number; scanPercent: number }
  daily: { day: string; scans: number }[]
  topLinks: QrTopLink[]
}

export function percentOf(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10
}

type RawLink = { id: string; shortCode: string; title: string | null; scans: bigint | number; total: bigint | number }

export function rankQrLinks(rows: RawLink[], limit = QR_TOP_LIMIT): QrTopLink[] {
  return rows
    .map((r) => ({ id: r.id, shortCode: r.shortCode, title: r.title, scans: Number(r.scans), totalClicks: Number(r.total) }))
    .filter((r) => r.scans > 0)
    .map((r) => ({ ...r, scanPercent: percentOf(r.scans, r.totalClicks) }))
    .sort((a, b) => b.scans - a.scans || a.shortCode.localeCompare(b.shortCode))
    .slice(0, limit)
}

/** Fills every day in the window (UTC, oldest first) so charts have no gaps. */
export function fillDaily(rows: { day: string; scans: number }[], days: number, now = new Date()): { day: string; scans: number }[] {
  const byDay = new Map(rows.map((r) => [r.day, r.scans]))
  const out: { day: string; scans: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    out.push({ day, scans: byDay.get(day) ?? 0 })
  }
  return out
}

export async function getQrScanReport(scope: AnalyticsScope, days: number): Promise<QrScanReport> {
  const since = new Date(Date.now() - days * 86_400_000)
  const window = Prisma.sql`c."createdAt" >= ${since}`
  const isQr = Prisma.sql`lower(btrim(COALESCE(c."utmMedium", ''))) = 'qr'`
  const [linkRows, dailyRows] = await Promise.all([
    prisma.$queryRaw<RawLink[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", COUNT(*) FILTER (WHERE ${isQr}) AS scans, COUNT(*) AS total
      FROM "click_events" c JOIN "urls" u ON u."id" = c."urlId"
      WHERE ${scopeFilter(scope)} AND ${window}
      GROUP BY u."id", u."shortCode", u."title"`),
    prisma.$queryRaw<{ day: string; scans: bigint }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', c."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*) AS scans
      FROM "click_events" c JOIN "urls" u ON u."id" = c."urlId"
      WHERE ${scopeFilter(scope)} AND ${window} AND ${isQr} GROUP BY 1 ORDER BY 1`),
  ])
  const scans = linkRows.reduce((s, r) => s + Number(r.scans), 0)
  const clicks = linkRows.reduce((s, r) => s + Number(r.total), 0)
  return {
    days,
    totals: { scans, clicks, scanPercent: percentOf(scans, clicks) },
    daily: fillDaily(dailyRows.map((r) => ({ day: r.day, scans: Number(r.scans) })), days),
    topLinks: rankQrLinks(linkRows),
  }
}
