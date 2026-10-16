import { NextResponse } from 'next/server'
import { serializeCsv } from '@/lib/csv'

type Cell = string | number | boolean | null | undefined

/** Flatten an array of shaped stat objects into CSV rows; columns come from the first row's scalar fields. */
export function statsToCsvRows(stats: Record<string, unknown>[]): Cell[][] {
  if (stats.length === 0) return [[]]
  const columns = Object.keys(stats[0]).filter((k) => {
    const v = stats[0][k]
    return v === null || ['string', 'number', 'boolean'].includes(typeof v)
  })
  return [columns, ...stats.map((s) => columns.map((c) => s[c] as Cell))]
}

/** Returns a CSV attachment response when ?format=csv, otherwise null so the route serves JSON. */
export function maybeCsvResponse(format: string | null, stats: Record<string, unknown>[], filename: string): NextResponse | null {
  if (format !== 'csv') return null
  return new NextResponse(serializeCsv(statsToCsvRows(stats)), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
