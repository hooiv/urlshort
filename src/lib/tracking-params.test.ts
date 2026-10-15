import { describe, it, expect } from 'vitest'
import { stripTrackingParams, parseDirtyLimit } from './tracking-params'

describe('stripTrackingParams', () => {
  it('removes click ids but keeps UTM and other params', () => {
    const r = stripTrackingParams('https://a.com/p?utm_source=x&fbclid=abc&id=3&gclid=z')
    expect(r?.cleanUrl).toBe('https://a.com/p?utm_source=x&id=3')
    expect(r?.removed).toEqual(['fbclid', 'gclid'])
  })
  it('is case-insensitive on keys and drops the ? when empty', () => {
    expect(stripTrackingParams('https://a.com/?FBCLID=1')?.cleanUrl).toBe('https://a.com/')
  })
  it('returns null when clean or invalid', () => {
    expect(stripTrackingParams('https://a.com/?utm_source=x')).toBeNull()
    expect(stripTrackingParams('not a url')).toBeNull()
  })
})
describe('parseDirtyLimit', () => {
  it('validates', () => {
    expect(parseDirtyLimit(null)).toBe(50)
    expect(parseDirtyLimit('200')).toBe(200)
    expect(parseDirtyLimit('201')).toBeNull()
    expect(parseDirtyLimit('x')).toBeNull()
  })
})
