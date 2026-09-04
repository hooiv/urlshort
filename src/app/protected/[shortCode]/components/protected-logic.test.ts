import { describe, expect, it } from 'vitest'
import {
  buildUnlockPath,
  buildVerifyUrl,
  isValidShortCode,
  parseShortCode,
} from './protected-logic'

describe('parseShortCode', () => {
  it('trims strings and picks the first non-empty array entry', () => {
    expect(parseShortCode(' abc ')).toBe('abc')
    expect(parseShortCode(['', 'x'])).toBe('x')
    expect(parseShortCode(undefined)).toBe('')
    expect(parseShortCode(['', ' '])).toBe('')
  })
})

describe('buildVerifyUrl', () => {
  it('encodes the code so slashes cannot escape the route', () => {
    expect(buildVerifyUrl('abc')).toBe('/api/links/abc/verify')
    expect(buildVerifyUrl('a/b')).toBe('/api/links/a%2Fb/verify')
  })
})

describe('buildUnlockPath', () => {
  it('encodes hostile codes instead of pushing them raw', () => {
    expect(buildUnlockPath('abc')).toBe('/abc')
    expect(buildUnlockPath('../account')).toBe('/..%2Faccount')
    expect(buildUnlockPath('a/b')).toBe('/a%2Fb')
  })
})

describe('isValidShortCode', () => {
  it('rejects empty, oversized, or slash-containing codes', () => {
    expect(isValidShortCode('abc')).toBe(true)
    expect(isValidShortCode('')).toBe(false)
    expect(isValidShortCode('a/b')).toBe(false)
    expect(isValidShortCode('x'.repeat(129))).toBe(false)
  })
})
