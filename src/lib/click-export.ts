import { prisma } from './prisma'
import { serializeCsv } from './csv'
import { parseDateBound } from './account-audit-export'

/** Raw click export columns. IP and user agent are deliberately excluded (personal data). */
export const CLICK_EXPORT_COLUMNS = [
  'id', 'timestamp', 'country', 'city', 'device', 'os', 'browser', 'language', 'traffic_type',
  'referrer_host', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
] as const

export const CLICK_EXPORT_PAGE_SIZE = 1000
export const CLICK_EXPORT_MAX_ROWS = 100_000
export const CLICK_EXPORT_MAX_DAYS = 366

export type ClickExportFormat = 'csv' | 'ndjson'

export function parseClickExportFormat(raw: string | null): ClickExportFormat | null {
  if (raw === null || raw === '') return 'csv'
  return raw === 'csv' || raw === 'ndjson' ? raw : null
}

export interface ClickExportRange { from: Date; to: Date }

/** Default window is the last 30 days; explicit ranges are capped at 366 days. */
export function parseClickExportRange(fromRaw: string | null, toRaw: string | null, now = new Date()): ClickExportRange | { error: string } {
  const to = toRaw ? parseDateBound(toRaw, true) : now
  if (!to) return { error: 'to must be YYYY-MM-DD or an ISO timestamp' }
  const from = fromRaw ? parseDateBound(fromRaw, false) : new Date(to.getTime() - 30 * 86_400_000)
  if (!from) return { error: 'from must be YYYY-MM-DD or an ISO timestamp' }
  if (from > to) return { error: 'from must not be after to' }
  if (to.getTime() - from.getTime() > CLICK_EXPORT_MAX_DAYS * 86_400_000) return { error: `Range cannot exceed ${CLICK_EXPORT_MAX_DAYS} days` }
  return { from, to }
}

export interface ExportClickRow {
  id: string; createdAt: Date; country: string | null; city: string | null; deviceType: string | null
  os: string | null; browser: string | null; language: string | null; trafficType: string
  referrerHost: string | null; utmSource: string | null; utmMedium: string | null
  utmCampaign: string | null; utmTerm: string | null; utmContent: string | null
}

export function clickToRecord(row: ExportClickRow): Record<(typeof CLICK_EXPORT_COLUMNS)[number], string | null> {
  return {
    id: row.id, timestamp: row.createdAt.toISOString(), country: row.country, city: row.city,
    device: row.deviceType, os: row.os, browser: row.browser, language: row.language,
    traffic_type: row.trafficType, referrer_host: row.referrerHost, utm_source: row.utmSource,
    utm_medium: row.utmMedium, utm_campaign: row.utmCampaign, utm_term: row.utmTerm, utm_content: row.utmContent,
  }
}

export function clicksToCsvChunk(rows: ExportClickRow[], includeHeader: boolean): string {
  const body = rows.map((r) => { const rec = clickToRecord(r); return CLICK_EXPORT_COLUMNS.map((c) => rec[c]) })
  const all = includeHeader ? [[...CLICK_EXPORT_COLUMNS], ...body] : body
  return all.length ? serializeCsv(all) + '\r\n' : ''
}

export function clicksToNdjsonChunk(rows: ExportClickRow[]): string {
  return rows.map((r) => JSON.stringify(clickToRecord(r)) + '\n').join('')
}

/** Keyset-paginated (createdAt, id) async iterator so memory stays flat for large exports. */
export async function* iterateClicks(urlId: string, range: ClickExportRange, maxRows = CLICK_EXPORT_MAX_ROWS): AsyncGenerator<ExportClickRow[]> {
  let cursor: { createdAt: Date; id: string } | null = null
  let remaining = maxRows
  while (remaining > 0) {
    const take = Math.min(CLICK_EXPORT_PAGE_SIZE, remaining)
    const rows: ExportClickRow[] = await prisma.clickEvent.findMany({
      where: {
        urlId,
        createdAt: { gte: range.from, lte: range.to },
        ...(cursor ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      select: {
        id: true, createdAt: true, country: true, city: true, deviceType: true, os: true, browser: true,
        language: true, trafficType: true, referrerHost: true, utmSource: true, utmMedium: true,
        utmCampaign: true, utmTerm: true, utmContent: true,
      },
    })
    if (rows.length === 0) return
    yield rows
    remaining -= rows.length
    if (rows.length < take) return
    const last = rows[rows.length - 1]
    cursor = { createdAt: last.createdAt, id: last.id }
  }
}
