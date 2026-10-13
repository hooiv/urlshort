import { describe, expect, it } from 'vitest'
import { parseBrokenLimit, parseBrokenStatus, shapeBroken } from './broken-links'

describe('broken links', () => {
  it('parses status filter', () => {
    expect(parseBrokenStatus(null)).toEqual(['down', 'degraded'])
    expect(parseBrokenStatus('all')).toEqual(['down', 'degraded'])
    expect(parseBrokenStatus('down')).toEqual(['down'])
    expect(parseBrokenStatus('healthy')).toBeNull()
    expect(parseBrokenStatus("down'; --")).toBeNull()
  })
  it('parses limit', () => {
    expect(parseBrokenLimit(null)).toBe(50)
    expect(parseBrokenLimit('200')).toBe(200)
    expect(parseBrokenLimit('201')).toBeNull()
    expect(parseBrokenLimit('0')).toBeNull()
    expect(parseBrokenLimit('1e2')).toBeNull()
  })
  it('shapes rows and truncates long errors', () => {
    const [r] = shapeBroken([{ id: 'a', shortCode: 'x', title: null, originalUrl: 'https://e.com', healthStatus: 'down', healthStatusCode: 503, healthLastError: 'e'.repeat(500), healthConsecutiveFailures: 4, healthCheckedAt: new Date('2026-10-13T00:00:00Z'), recent: BigInt(7) }])
    expect(r.lastError).toHaveLength(200)
    expect(r.clicksLast7d).toBe(7)
    expect(r.checkedAt).toBe('2026-10-13T00:00:00.000Z')
  })
})
