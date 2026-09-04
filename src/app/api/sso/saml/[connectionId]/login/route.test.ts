import { describe, expect, it } from 'vitest'
import { sanitizeReturnTo } from './route'

describe('sanitizeReturnTo', () => {
  it('allows absolute-path targets', () => {
    expect(sanitizeReturnTo('/dashboard')).toBe('/dashboard')
    expect(sanitizeReturnTo('/w/123')).toBe('/w/123')
  })

  it('blocks open redirects and protocol-relative urls', () => {
    expect(sanitizeReturnTo('https://evil.test/x')).toBe('/dashboard')
    expect(sanitizeReturnTo('//evil.test/x')).toBe('/dashboard')
    expect(sanitizeReturnTo('')).toBe('/dashboard')
    expect(sanitizeReturnTo(null)).toBe('/dashboard')
  })
})
