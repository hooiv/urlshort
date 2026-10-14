import { describe, expect, it } from 'vitest'
import { parseUntaggedLimit, untaggedShare, UNTAGGED_DEFAULT } from './untagged-links'

describe('untagged-links', () => {
  it('parses limits strictly', () => {
    expect(parseUntaggedLimit(null)).toBe(UNTAGGED_DEFAULT)
    expect(parseUntaggedLimit('')).toBe(UNTAGGED_DEFAULT)
    expect(parseUntaggedLimit('200')).toBe(200)
    expect(parseUntaggedLimit('201')).toBeNull()
    expect(parseUntaggedLimit('0')).toBeNull()
    expect(parseUntaggedLimit('1e2')).toBeNull()
    expect(parseUntaggedLimit('-5')).toBeNull()
  })
  it('computes share', () => {
    expect(untaggedShare(0, 0)).toBe(0)
    expect(untaggedShare(1, 3)).toBe(33)
    expect(untaggedShare(3, 3)).toBe(100)
  })
})
