import { describe, expect, it } from 'vitest'
import { parseSingleUseLimit, parseSingleUseStatus, singleUseStatus } from './single-use-links'

describe('single-use-links', () => {
  it('parses limit strictly', () => {
    expect(parseSingleUseLimit(null)).toBe(50)
    expect(parseSingleUseLimit('200')).toBe(200)
    expect(parseSingleUseLimit('201')).toBeNull()
    expect(parseSingleUseLimit('0')).toBeNull()
    expect(parseSingleUseLimit('1e2')).toBeNull()
  })
  it('parses status', () => {
    expect(parseSingleUseStatus(null)).toBe('all')
    expect(parseSingleUseStatus('pending')).toBe('pending')
    expect(parseSingleUseStatus('consumed')).toBe('consumed')
    expect(parseSingleUseStatus('x')).toBeNull()
  })
  it('classifies by clicks', () => {
    expect(singleUseStatus(0)).toBe('pending')
    expect(singleUseStatus(1)).toBe('consumed')
  })
})
