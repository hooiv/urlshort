import { serializeCsv } from '@/lib/csv'
import type { getAggregatedAnalytics } from '@/lib/aggregate-analytics'

type Analytics = Awaited<ReturnType<typeof getAggregatedAnalytics>>

export const EXPORT_SECTIONS = ['timeseries', 'links', 'tags', 'countries', 'devices', 'referrers'] as const
export type ExportSection = (typeof EXPORT_SECTIONS)[number]

export function parseExportSection(value: string | null): ExportSection | null {
  if (value === null || value === '') return 'timeseries'
  return (EXPORT_SECTIONS as readonly string[]).includes(value) ? (value as ExportSection) : null
}

/**
 * Spreadsheet apps execute cells starting with = + - @ (or tab/CR) as formulas.
 * Link titles, URLs, tags and referrers are attacker-influenced, so prefix a
 * quote to force them to render as text.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

const text = (value: string | null | undefined) => (value == null ? '' : neutralizeFormula(value))
const dollars = (cents: number) => (cents / 100).toFixed(2)

export function analyticsToCsv(data: Analytics, section: ExportSection): string {
  switch (section) {
    case 'timeseries':
      return serializeCsv([
        ['date', 'clicks', 'conversions', 'revenue'],
        ...data.timeseries.map((d) => [d.date, d.clicks, d.conversions, dollars(d.revenueCents)]),
      ])
    case 'links':
      return serializeCsv([
        ['short_code', 'title', 'destination', 'clicks', 'conversions', 'revenue'],
        ...data.topLinks.map((l) => [l.shortCode, text(l.title), text(l.originalUrl), l.clicks, l.conversions, dollars(l.revenueCents)]),
      ])
    case 'tags':
      return serializeCsv([['tag', 'links', 'clicks'], ...data.tags.map((t) => [text(t.tag), t.links, t.clicks])])
    case 'countries':
    case 'devices':
    case 'referrers':
      return serializeCsv([
        [section === 'countries' ? 'country' : section === 'devices' ? 'device' : 'referrer', 'clicks'],
        ...data.breakdowns[section].map((b) => [text(b.key), b.clicks]),
      ])
  }
}

export function exportFilename(section: ExportSection, window: { from: string; to: string }): string {
  return `quicklink-${section}-${window.from}_${window.to}.csv`
}
