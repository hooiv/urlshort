import { describe, expect, it } from 'vitest'
import { isExcludedFromAnalytics, parseExclusions } from './analytics-exclusions'

describe('analytics exclusions', () => {
  it('validates lists', () => {
    expect(parseExclusions(['203.0.113.0/24'])).toEqual(['203.0.113.0/24'])
    expect(parseExclusions(['nope'])).toBeNull()
  })
  it('excludes matching ips only', () => {
    expect(isExcludedFromAnalytics('203.0.113.9', ['203.0.113.0/24'])).toBe(true)
    expect(isExcludedFromAnalytics('198.51.100.1', ['203.0.113.0/24'])).toBe(false)
  })
  it('never excludes unknown ip or empty list', () => {
    expect(isExcludedFromAnalytics('unknown', ['0.0.0.0/0'])).toBe(false)
    expect(isExcludedFromAnalytics(null, ['1.1.1.1'])).toBe(false)
    expect(isExcludedFromAnalytics('1.1.1.1', [])).toBe(false)
  })
})
