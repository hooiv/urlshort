import { describe, expect, it } from 'vitest'
import { parseUntitledLimit, untitledShare, UNTITLED_DEFAULT } from './untitled-links'

describe('untitled-links', () => {
  it('parses limits strictly', () => {
    expect(parseUntitledLimit(null)).toBe(UNTITLED_DEFAULT)
    expect(parseUntitledLimit('')).toBe(UNTITLED_DEFAULT)
    expect(parseUntitledLimit('200')).toBe(200)
    expect(parseUntitledLimit('201')).toBeNull()
    expect(parseUntitledLimit('0')).toBeNull()
    expect(parseUntitledLimit('1e2')).toBeNull()
    expect(parseUntitledLimit('-5')).toBeNull()
  })
  it('computes share', () => {
    expect(untitledShare(0, 0)).toBe(0)
    expect(untitledShare(1, 3)).toBe(33)
    expect(untitledShare(3, 3)).toBe(100)
  })
})
