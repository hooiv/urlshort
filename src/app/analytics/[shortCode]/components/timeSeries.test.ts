import { describe, expect, it } from 'vitest'
import {
  areaPath,
  buildPoints,
  computeMaxima,
  createScales,
  indexFromClientX,
  labelEvery,
  linePath,
  CHART_HEIGHT,
  CHART_PAD_X,
  CHART_PAD_Y,
  CHART_WIDTH,
  type TimeSeriesPoint,
} from './timeSeries'

const clicks = { '2026-08-01': 10, '2026-08-02': 20, '2026-08-03': 5 }
const conversions = { '2026-08-01': 1, '2026-08-03': 2 }
const revenue = { '2026-08-02': 4999 }

describe('buildPoints', () => {
  it('merges rollups into one sorted list with zero-filled gaps', () => {
    const points = buildPoints(clicks, conversions, revenue, false)
    expect(points.map((p) => p.key)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
    expect(points[1]).toMatchObject({ clicks: 20, conversions: 0, revenue: 49.99 })
    expect(points[2]).toMatchObject({ clicks: 5, conversions: 2, revenue: 0 })
  })

  it('labels hours as HH:MM and days as month/day', () => {
    const hourly = buildPoints({ '2026-08-01T14:00:00': 3 }, {}, {}, true)
    expect(hourly[0].label).toBe('14:00')
    const daily = buildPoints({ '2026-08-01': 3 }, {}, {}, false)
    expect(daily[0].label).toMatch(/Aug/)
  })
})

describe('computeMaxima', () => {
  it('floors empty scales at 1 so geometry never divides by zero', () => {
    expect(computeMaxima([])).toEqual({ clicks: 1, conversions: 1, revenue: 1 })
    expect(computeMaxima(buildPoints(clicks, conversions, revenue, false))).toMatchObject({
      clicks: 20,
      conversions: 2,
      revenue: 49.99,
    })
  })
})

describe('scales and paths', () => {
  const points = buildPoints(clicks, conversions, revenue, false)
  const scales = createScales(points.length, computeMaxima(points))

  it('spans the full chart width and maps maxima to the top edge', () => {
    expect(scales.getX(0)).toBe(CHART_PAD_X)
    expect(scales.getX(2)).toBe(CHART_WIDTH - CHART_PAD_X)
    expect(scales.yFor('clicks', 20)).toBe(CHART_PAD_Y)
    expect(scales.yFor('clicks', 0)).toBe(CHART_HEIGHT - CHART_PAD_Y)
  })

  it('centers a lone data point instead of pinning it to the edge', () => {
    const single = createScales(1, { clicks: 1, conversions: 1, revenue: 1 })
    expect(single.getX(0)).toBe(CHART_WIDTH / 2)
  })

  it('emits line and closed area paths, with no area for a single point', () => {
    const line = linePath(points, 'clicks', scales)
    expect(line.split(' ')).toHaveLength(9) // M x y + 2 × L x y
    expect(line.startsWith('M')).toBe(true)
    const area = areaPath(points, 'clicks', scales)
    expect(area.endsWith('Z')).toBe(true)
    const lone: TimeSeriesPoint[] = [{ key: 'a', label: 'a', clicks: 1, conversions: 0, revenue: 0 }]
    const loneScales = createScales(1, computeMaxima(lone))
    expect(areaPath(lone, 'clicks', loneScales)).toBe('')
  })
})

describe('indexFromClientX', () => {
  it('maps CSS pixels through the viewBox, clamped to the point range', () => {
    // 400 CSS px wide element showing the 800-unit viewBox: clientX 200 → viewBox x=400 (middle) → index 1 of 3.
    expect(indexFromClientX(200, 0, 400, 3)).toBe(1)
    expect(indexFromClientX(-50, 0, 400, 3)).toBe(0)
    expect(indexFromClientX(9999, 0, 400, 3)).toBe(2)
    expect(indexFromClientX(100, 0, 0, 3)).toBe(0)
  })
})

describe('labelEvery', () => {
  it('keeps at most ~6 axis labels', () => {
    expect(labelEvery(3)).toBe(1)
    expect(labelEvery(90)).toBe(15)
  })
})
