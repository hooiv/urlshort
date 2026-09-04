'use client'

import { useMemo, useRef, useState } from 'react'
import { formatNumber } from '@/lib/format'
import type { ChartMetric } from './types'
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
  CHART_H,
  type TimeSeriesKey,
} from './timeSeries'

const SERIES_STYLE: Record<TimeSeriesKey, { color: string; gradientId: string; label: string }> = {
  clicks: { color: '#3b82f6', gradientId: 'clickGrad', label: 'Clicks' },
  conversions: { color: '#10b981', gradientId: 'convGrad', label: 'Conversions' },
  revenue: { color: '#f59b0b', gradientId: 'revGrad', label: 'Revenue' },
}

const VISIBLE_SERIES: Record<ChartMetric, TimeSeriesKey[]> = {
  clicks: ['clicks'],
  conversions: ['conversions'],
  revenue: ['revenue'],
  both: ['clicks', 'conversions'],
}

function formatSeriesValue(series: TimeSeriesKey, value: number): string {
  if (series === 'revenue') return `$${value.toFixed(2)}`
  return formatNumber(value)
}

export default function TimeSeriesChart({
  clicksByDate,
  conversionByDate,
  revenueByDate,
  revenueByHour,
  metric,
  isHourly,
}: {
  clicksByDate: Record<string, number>
  conversionByDate: Record<string, number>
  revenueByDate: Record<string, number>
  revenueByHour?: Record<string, number>
  metric: ChartMetric
  isHourly: boolean
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const visible = VISIBLE_SERIES[metric]

  const points = useMemo(
    () => buildPoints(clicksByDate, conversionByDate, isHourly ? (revenueByHour ?? revenueByDate) : revenueByDate, isHourly),
    [clicksByDate, conversionByDate, revenueByDate, revenueByHour, isHourly]
  )
  const maxima = useMemo(() => computeMaxima(points), [points])
  const scales = useMemo(() => createScales(points.length, maxima), [points.length, maxima])
  const totals = useMemo(
    () => ({
      clicks: points.reduce((n, p) => n + p.clicks, 0),
      conversions: points.reduce((n, p) => n + p.conversions, 0),
      revenue: points.reduce((n, p) => n + p.revenue, 0),
    }),
    [points]
  )

  if (!points.length) {
    return <div className="py-16 text-center text-xs text-slate-500">No traffic recorded for this time window.</div>
  }

  const activePoint = hoverIndex !== null ? points[hoverIndex] : points[points.length - 1]

  const handleMove = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const index = indexFromClientX(clientX, rect.left, rect.width, points.length)
    // Hover fires per pointer pixel — only re-render when the point changes.
    setHoverIndex((prev) => (prev === index ? prev : index))
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const current = hoverIndex ?? points.length - 1
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setHoverIndex(Math.max(0, current - 1))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setHoverIndex(Math.min(points.length - 1, current + 1))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setHoverIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setHoverIndex(points.length - 1)
    } else if (event.key === 'Escape') {
      setHoverIndex(null)
    }
  }

  const every = labelEvery(points.length)

  return (
    <div className="relative w-full overflow-hidden select-none">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs" aria-live="polite">
        <div className="font-mono text-slate-400">{activePoint.label}</div>
        {visible.map((series) => (
          <div key={series} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES_STYLE[series].color }} />
            <span className="text-slate-300">{SERIES_STYLE[series].label}: </span>
            <strong className="text-white">{formatSeriesValue(series, activePoint[series])}</strong>
          </div>
        ))}
        <div className="ml-auto hidden items-center gap-3 sm:flex">
          {visible.map((series) => (
            <div key={series} className="flex items-center gap-1.5 text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES_STYLE[series].color }} />
              <span>max {formatSeriesValue(series, maxima[series])}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        tabIndex={0}
        role="img"
        aria-label={`Traffic chart: ${formatNumber(totals.clicks)} clicks, ${formatNumber(totals.conversions)} conversions, $${totals.revenue.toFixed(2)} revenue across ${points.length} ${isHourly ? 'hours' : 'days'}. Use arrow keys to inspect individual points.`}
        onKeyDown={handleKeyDown}
        onMouseMove={(e) => handleMove(e.clientX)}
        onMouseLeave={() => setHoverIndex(null)}
        onTouchStart={(e) => {
          if (e.touches[0]) handleMove(e.touches[0].clientX)
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) handleMove(e.touches[0].clientX)
        }}
        className="outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50 rounded"
      >
        <svg ref={svgRef} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full h-auto overflow-visible">
          <defs>
            <linearGradient id="clickGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59b0b" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#f59b0b" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          <line x1={CHART_PAD_X} y1={CHART_PAD_Y} x2={CHART_WIDTH - CHART_PAD_X} y2={CHART_PAD_Y} stroke="#1e293b" strokeDasharray="3 3" />
          <line
            x1={CHART_PAD_X}
            y1={CHART_PAD_Y + CHART_H / 2}
            x2={CHART_WIDTH - CHART_PAD_X}
            y2={CHART_PAD_Y + CHART_H / 2}
            stroke="#1e293b"
            strokeDasharray="3 3"
          />
          <line x1={CHART_PAD_X} y1={CHART_HEIGHT - CHART_PAD_Y} x2={CHART_WIDTH - CHART_PAD_X} y2={CHART_HEIGHT - CHART_PAD_Y} stroke="#334155" />

          {visible.map((series) => (
            <g key={series}>
              {points.length > 1 && <path d={areaPath(points, series, scales)} fill={`url(#${SERIES_STYLE[series].gradientId})`} />}
              <path
                d={linePath(points, series, scales)}
                fill="none"
                stroke={SERIES_STYLE[series].color}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {points.length === 1 && (
                <circle cx={scales.getX(0)} cy={scales.yFor(series, points[0][series])} r="4.5" fill={SERIES_STYLE[series].color} stroke="#ffffff" strokeWidth="2" />
              )}
            </g>
          ))}

          {hoverIndex !== null && (
            <>
              <line
                x1={scales.getX(hoverIndex)}
                y1={CHART_PAD_Y}
                x2={scales.getX(hoverIndex)}
                y2={CHART_HEIGHT - CHART_PAD_Y}
                stroke="#64748b"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              {visible.map((series) => (
                <circle
                  key={series}
                  cx={scales.getX(hoverIndex)}
                  cy={scales.yFor(series, points[hoverIndex][series])}
                  r="4.5"
                  fill={SERIES_STYLE[series].color}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              ))}
            </>
          )}

          {points.map((p, i) => {
            if (i % every !== 0 && i !== points.length - 1) return null
            return (
              <text
                key={p.key}
                x={scales.getX(i)}
                y={CHART_HEIGHT - 10}
                textAnchor="middle"
                fill="#64748b"
                fontSize="10"
                fontFamily="monospace"
              >
                {p.label}
              </text>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
