import { describe, expect, it } from 'vitest'
import { relayMatches } from './route'

describe('relayMatches', () => {
  it('matches identical relays only', () => {
    expect(relayMatches('abc123', 'abc123')).toBe(true)
    expect(relayMatches('abc123', 'abc124')).toBe(false)
    expect(relayMatches('short', 'longer')).toBe(false)
  })

  it('rejects empty inputs', () => {
    expect(relayMatches('', '')).toBe(false)
    expect(relayMatches('', 'x')).toBe(false)
    expect(relayMatches('x', '')).toBe(false)
  })
})
