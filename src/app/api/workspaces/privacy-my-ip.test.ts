import { describe, it, expect } from 'vitest'
import { isExcludedFromAnalytics } from '@/lib/analytics-exclusions'

describe('my-ip exclusion check', () => {
  it('reports excluded for CIDR match and not for unknown', () => {
    expect(isExcludedFromAnalytics('198.51.100.9', ['198.51.100.0/24'])).toBe(true)
    expect(isExcludedFromAnalytics('unknown', ['198.51.100.0/24'])).toBe(false)
    expect(isExcludedFromAnalytics('203.0.113.1', [])).toBe(false)
  })
})
