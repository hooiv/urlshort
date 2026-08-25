import { describe, expect, it } from 'vitest'
import { generateShortCode, isReservedCode, isValidUrl, normalizeUrl } from './utils'

describe('isReservedCode', () => {
  it('blocks app-route shadows', () => {
    expect(isReservedCode('login')).toBe(true)
    expect(isReservedCode('api')).toBe(true)
    expect(isReservedCode('account')).toBe(true)
    expect(isReservedCode('admin')).toBe(true)
    expect(isReservedCode('manage')).toBe(true)
    expect(isReservedCode('workspaces')).toBe(true)
    expect(isReservedCode('verify-email')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isReservedCode('LOGIN')).toBe(true)
    expect(isReservedCode('Api')).toBe(true)
  })

  it('allows normal codes', () => {
    expect(isReservedCode('summer-sale')).toBe(false)
    expect(isReservedCode('abc1234')).toBe(false)
    expect(isReservedCode('my_link-1')).toBe(false)
  })
})

describe('generateShortCode', () => {
  it('never produces a reserved code', () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateShortCode()
      expect(code).toHaveLength(7)
      expect(isReservedCode(code)).toBe(false)
      // nanoid alphabet is A-Za-z0-9_-, matching CUSTOM_CODE validation.
      expect(/^[A-Za-z0-9_-]{7}$/.test(code)).toBe(true)
    }
  })
})

describe('isValidUrl / normalizeUrl', () => {
  it('accepts http(s) URLs only', () => {
    expect(isValidUrl('https://example.com')).toBe(true)
    expect(isValidUrl('ftp://example.com')).toBe(false)
    expect(isValidUrl('not a url')).toBe(false)
  })

  it('normalizes bare domains to https', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com')
    expect(normalizeUrl('http://example.com')).toBe('http://example.com')
  })
})
