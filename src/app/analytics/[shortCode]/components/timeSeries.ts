/**
 * Pure geometry and data shaping for the analytics time-series chart.
 *
 * Kept separate from the React component so scales, paths, and labels are
 * unit-testable without a DOM. The component only wires these to SVG.
 */

export const CHART_WIDTH = 800
export const CHART_HEIGHT = 240
export const CHART_PAD_X = 40
export const CHART_PAD_Y = 30
export const CHART_W = CHART_WIDTH - CHART_PAD_X * 2
export const CHART_H = CHART_HEIGHT - CHART_PAD_Y * 2

export type TimeSeriesKey = 'clicks' | 'conversions' | 'revenue'

export interface TimeSeriesPoint {
  key: string
  label: string
  clicks: number
  conversions: number
  /** Dollars (converted from integer cents upstream). */
  revenue: number
}

export function formatPointLabel(key: string, isHourly: boolean): string {
  if (isHourly) return key.slice(11, 16)
  return new Date(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Merge the three backend rollups into one sorted point list. */
export function buildPoints(
  clicksByDate: Record<string, number>,
  conversionByDate: Record<string, number>,
  revenueByDate: Record<string, number>,
  isHourly: boolean
): TimeSeriesPoint[] {
  const keys = Array.from(
    new Set([
      ...Object.keys(clicksByDate || {}),
      ...Object.keys(conversionByDate || {}),
      ...Object.keys(revenueByDate || {}),
    ])
  ).sort()
  return keys.map((key) => ({
    key,
    label: formatPointLabel(key, isHourly),
    clicks: clicksByDate[key] || 0,
    conversions: conversionByDate[key] || 0,
    revenue: (revenueByDate[key] || 0) / 100,
  }))
}

export type SeriesMaxima = Record<TimeSeriesKey, number>

/** Per-series maxima, floored at 1 so scales never divide by zero. */
export function computeMaxima(points: TimeSeriesPoint[]): SeriesMaxima {
  const max = (pick: (p: TimeSeriesPoint) => number) => Math.max(1, ...points.map(pick))
  return {
    clicks: max((p) => p.clicks),
    conversions: max((p) => p.conversions),
    revenue: max((p) => p.revenue),
  }
}

/** Map a pointer's client-X into a point index for a rendered SVG element. */
export function indexFromClientX(
  clientX: number,
  rectLeft: number,
  rectWidth: number,
  pointCount: number
): number {
  if (rectWidth <= 0 || pointCount === 0) return 0
  const x = ((clientX - rectLeft) / rectWidth) * CHART_WIDTH
  const ratio = Math.max(0, Math.min(1, (x - CHART_PAD_X) / CHART_W))
  return Math.round(ratio * (pointCount - 1))
}

export interface ChartScales {
  getX: (index: number) => number
  yFor: (series: TimeSeriesKey, value: number) => number
}

export function createScales(pointCount: number, maxima: SeriesMaxima): ChartScales {
  const getX = (index: number) =>
    pointCount <= 1 ? CHART_WIDTH / 2 : CHART_PAD_X + (index / (pointCount - 1)) * CHART_W
  const yFor = (series: TimeSeriesKey, value: number) =>
    CHART_HEIGHT - CHART_PAD_Y - (value / maxima[series]) * CHART_H
  return { getX, yFor }
}

export function linePath(points: TimeSeriesPoint[], series: TimeSeriesKey, scales: ChartScales): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scales.getX(i)} ${scales.yFor(series, p[series])}`)
    .join(' ')
}

export function areaPath(points: TimeSeriesPoint[], series: TimeSeriesKey, scales: ChartScales): string {
  if (points.length <= 1) return ''
  const baseline = CHART_HEIGHT - CHART_PAD_Y
  return `${linePath(points, series, scales)} L ${scales.getX(points.length - 1)} ${baseline} L ${scales.getX(0)} ${baseline} Z`
}

/** X-axis label sampling so at most ~6 labels render regardless of range. */
export function labelEvery(pointCount: number): number {
  return Math.max(1, Math.ceil(pointCount / 6))
}
