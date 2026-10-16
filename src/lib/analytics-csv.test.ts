import { describe, expect, it } from 'vitest'
import { maybeCsvResponse, statsToCsvRows } from './analytics-csv'

describe('analytics csv', () => {
  it('uses scalar columns of the first row', () => {
    const rows = statsToCsvRows([{ name: 'US', clicks: 3, nested: { a: 1 }, changePct: null }])
    expect(rows[0]).toEqual(['name', 'clicks', 'changePct'])
    expect(rows[1]).toEqual(['US', 3, null])
  })
  it('handles empty input', () => {
    expect(statsToCsvRows([])).toEqual([[]])
  })
  it('returns null unless format=csv', () => {
    expect(maybeCsvResponse(null, [], 'x')).toBeNull()
    expect(maybeCsvResponse('json', [], 'x')).toBeNull()
  })
  it('builds an attachment and neutralizes formulas', async () => {
    const res = maybeCsvResponse('csv', [{ name: '=cmd()', clicks: 2 }], 'countries-30d')!
    expect(res.headers.get('content-disposition')).toContain('countries-30d.csv')
    const body = await res.text()
    expect(body).toContain('"clicks"')
    expect(body).not.toContain('"=cmd()"')
  })
})
