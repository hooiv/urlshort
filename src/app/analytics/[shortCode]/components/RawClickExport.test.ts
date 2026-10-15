import { describe, expect, it } from 'vitest'
import { buildClickExportHref } from './RawClickExport'

describe('buildClickExportHref', () => {
  it('omits empty dates', () => {
    expect(buildClickExportHref('ab', 'csv', '', '')).toBe('/api/analytics/ab/clicks?format=csv')
  })
  it('includes range and encodes code', () => {
    expect(buildClickExportHref('a/b', 'ndjson', '2026-01-01', '2026-02-01')).toBe(
      '/api/analytics/a%2Fb/clicks?format=ndjson&from=2026-01-01&to=2026-02-01',
    )
  })
})
