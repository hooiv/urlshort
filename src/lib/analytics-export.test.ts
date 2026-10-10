import { describe, expect, it } from 'vitest'
import { analyticsToCsv, exportFilename, neutralizeFormula, parseExportSection } from './analytics-export'

const data = {
  window: { from: '2026-10-01', to: '2026-10-02', days: 2 },
  timeseries: [{ date: '2026-10-01', clicks: 5, conversions: 1, revenueCents: 1250 }, { date: '2026-10-02', clicks: 0, conversions: 0, revenueCents: 0 }],
  topLinks: [{ id: 'a', shortCode: 'abc', title: '=HYPERLINK("http://evil")', originalUrl: 'https://x.test/a,b', clicks: 5, conversions: 1, revenueCents: 1250 }],
  tags: [{ tag: 'launch', links: 2, clicks: 9 }],
  breakdowns: { countries: [{ key: 'IN', clicks: 4 }], devices: [], referrers: [{ key: '@bad', clicks: 1 }] },
} as never

describe('analytics export', () => {
  it('serializes the gap-free timeseries with dollar revenue', () => {
    expect(analyticsToCsv(data, 'timeseries')).toBe('"date","clicks","conversions","revenue"\n"2026-10-01","5","1","12.50"\n"2026-10-02","0","0","0.00"')
  })
  it('neutralizes spreadsheet formulas and quotes commas', () => {
    const csv = analyticsToCsv(data, 'links')
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(csv).toContain('"https://x.test/a,b"')
    expect(analyticsToCsv(data, 'referrers')).toContain(`"'@bad"`)
    expect(neutralizeFormula('safe')).toBe('safe')
  })
  it('validates sections and names files by window', () => {
    expect(parseExportSection(null)).toBe('timeseries')
    expect(parseExportSection('nope')).toBeNull()
    expect(exportFilename('tags', { from: '2026-10-01', to: '2026-10-02' })).toBe('quicklink-tags-2026-10-01_2026-10-02.csv')
  })

  it('neutralizes every formula trigger character and leaves mid-string ones alone', () => {
    for (const c of ['=', '+', '-', '@', '\t', '\r']) expect(neutralizeFormula(`${c}x`)).toBe(`'${c}x`)
    expect(neutralizeFormula('a=b')).toBe('a=b')
    expect(neutralizeFormula('')).toBe('')
  })
})
