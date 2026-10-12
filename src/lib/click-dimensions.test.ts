import { describe, expect, it, vi } from 'vitest'
import { aggregateDimensions, applyDimensionRollups } from './click-dimensions'

const base = { urlId: 'u1', dateKey: '2026-10-12' }

describe('aggregateDimensions', () => {
  it('counts each human click once per dimension and merges identical keys', () => {
    const rows = aggregateDimensions([
      { ...base, country: 'US', deviceType: 'mobile', referrerHost: 'google.com' },
      { ...base, country: 'US', deviceType: 'desktop', referrerHost: 'google.com' },
    ])
    const get = (dimension: string, key: string) => rows.find((r) => r.dimension === dimension && r.key === key)?.clicks
    expect(get('country', 'US')).toBe(2)
    expect(get('device', 'mobile')).toBe(1)
    expect(get('referrer', 'google.com')).toBe(2)
    expect(rows).toHaveLength(4)
  })

  it('skips bot traffic and buckets missing values as unknown', () => {
    const rows = aggregateDimensions([
      { ...base, trafficType: 'bot', country: 'US' },
      { ...base, country: '  ', deviceType: null },
    ])
    expect(rows.every((r) => r.key === 'unknown')).toBe(true)
    expect(rows.reduce((sum, r) => sum + r.clicks, 0)).toBe(3)
  })

  it('separates days and links', () => {
    const rows = aggregateDimensions([
      { ...base, country: 'US' },
      { ...base, dateKey: '2026-10-13', country: 'US' },
      { ...base, urlId: 'u2', country: 'US' },
    ])
    expect(rows.filter((r) => r.dimension === 'country')).toHaveLength(3)
  })

  it('truncates oversized keys', () => {
    const rows = aggregateDimensions([{ ...base, referrerHost: 'a'.repeat(1000) }])
    expect(rows.find((r) => r.dimension === 'referrer')!.key).toHaveLength(255)
  })
})

describe('applyDimensionRollups', () => {
  it('issues no query for an empty batch and one statement otherwise', async () => {
    const tx = { $executeRaw: vi.fn().mockResolvedValue(1) }
    await applyDimensionRollups(tx, [])
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    await applyDimensionRollups(tx, aggregateDimensions([{ ...base, country: 'US' }]))
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
  })
})
