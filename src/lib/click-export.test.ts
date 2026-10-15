import { describe, expect, it, vi } from 'vitest'
vi.mock('./prisma', () => ({ prisma: { clickEvent: { findMany: vi.fn() } } }))
import { prisma } from './prisma'
import {
  CLICK_EXPORT_COLUMNS, clicksToCsvChunk, clicksToNdjsonChunk, iterateClicks, parseClickExportFormat, parseClickExportRange,
  type ExportClickRow,
} from './click-export'

const row = (id: string, t: string, over: Partial<ExportClickRow> = {}): ExportClickRow => ({
  id, createdAt: new Date(t), country: 'IN', city: 'Pune', deviceType: 'mobile', os: 'Android', browser: 'Chrome',
  language: 'en', trafficType: 'human', referrerHost: 'x.com', utmSource: null, utmMedium: null,
  utmCampaign: '=cmd', utmTerm: null, utmContent: null, ...over,
})

describe('click export', () => {
  it('parses format', () => {
    expect(parseClickExportFormat(null)).toBe('csv')
    expect(parseClickExportFormat('ndjson')).toBe('ndjson')
    expect(parseClickExportFormat('xml')).toBeNull()
  })
  it('validates ranges', () => {
    const now = new Date('2026-10-15T00:00:00Z')
    const d = parseClickExportRange(null, null, now) as { from: Date; to: Date }
    expect(d.to).toEqual(now)
    expect(now.getTime() - d.from.getTime()).toBe(30 * 86_400_000)
    expect(parseClickExportRange('2026-02-31', null, now)).toHaveProperty('error')
    expect(parseClickExportRange('2026-10-10', '2026-10-01', now)).toHaveProperty('error')
    expect(parseClickExportRange('2024-01-01', '2026-01-01', now)).toHaveProperty('error')
  })
  it('writes header once, neutralizes formulas, omits IP', () => {
    const csv = clicksToCsvChunk([row('a', '2026-10-01T00:00:00Z')], true)
    const lines = csv.trim().split(/\r?\n/)
    expect(lines[0].split(',')).toHaveLength(CLICK_EXPORT_COLUMNS.length)
    expect(lines[0]).not.toMatch(/ip|user_agent/)
    expect(lines[1]).toContain("'=cmd")
    expect(clicksToCsvChunk([row('b', '2026-10-01T00:00:00Z')], false)).not.toContain('"id"')
    expect(clicksToCsvChunk([], false)).toBe('')
  })
  it('ndjson one object per line', () => {
    const out = clicksToNdjsonChunk([row('a', '2026-10-01T00:00:00Z'), row('b', '2026-10-02T00:00:00Z')]).trim().split('\n')
    expect(out.map((l) => JSON.parse(l).id)).toEqual(['a', 'b'])
  })
  it('paginates by keyset and honours maxRows', async () => {
    const find = vi.mocked(prisma.clickEvent.findMany)
    const mk = (n: number, s: number) => Array.from({ length: n }, (_, i) => row(`c${s + i}`, '2026-10-01T00:00:00Z'))
    find.mockResolvedValueOnce(mk(1000, 0) as never).mockResolvedValueOnce(mk(5, 1000) as never)
    const sizes: number[] = []
    for await (const page of iterateClicks('u1', { from: new Date(0), to: new Date() })) sizes.push(page.length)
    expect(sizes).toEqual([1000, 5])
    const secondWhere = find.mock.calls[1][0]!.where as { OR?: unknown[] }
    expect(secondWhere.OR).toHaveLength(2)
    find.mockReset().mockResolvedValueOnce(mk(3, 0) as never)
    const capped: number[] = []
    for await (const page of iterateClicks('u1', { from: new Date(0), to: new Date() }, 3)) capped.push(page.length)
    expect(capped).toEqual([3])
    expect(find).toHaveBeenCalledTimes(1)
  })
})
