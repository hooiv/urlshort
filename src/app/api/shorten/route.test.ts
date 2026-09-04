import { describe, expect, it } from 'vitest'
import { parseShortenExpiresAt, parseShortenMaxClicks, shortenExtrasSchema } from './route'

describe('parseShortenMaxClicks', () => {
  it('accepts valid integers', () => {
    expect(parseShortenMaxClicks(null)).toBeNull()
    expect(parseShortenMaxClicks('')).toBeNull()
    expect(parseShortenMaxClicks('10')).toBe(10)
    expect(parseShortenMaxClicks(0)).toBe(0)
  })

  it('rejects NaN, negatives, and fractions', () => {
    expect(() => parseShortenMaxClicks('abc')).toThrow()
    expect(() => parseShortenMaxClicks('-1')).toThrow()
    expect(() => parseShortenMaxClicks('1.5')).toThrow()
    expect(() => parseShortenMaxClicks('2000000')).toThrow()
  })
})

describe('parseShortenExpiresAt', () => {
  it('accepts valid dates and rejects garbage', () => {
    expect(parseShortenExpiresAt(null)).toBeNull()
    expect(parseShortenExpiresAt('2030-01-01T00:00:00.000Z')).toBeInstanceOf(Date)
    expect(() => parseShortenExpiresAt('not-a-date')).toThrow()
  })
})

describe('shortenExtrasSchema', () => {
  it('caps password and pixel lengths', () => {
    expect(shortenExtrasSchema.safeParse({ password: 'x'.repeat(129) }).success).toBe(false)
    expect(shortenExtrasSchema.safeParse({ metaPixelId: 'x'.repeat(51) }).success).toBe(false)
    expect(shortenExtrasSchema.safeParse({ password: 'secret-1' }).success).toBe(true)
  })
})
