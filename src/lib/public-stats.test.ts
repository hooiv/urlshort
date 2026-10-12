import { describe, expect, it } from 'vitest'
import { generatePublicStatsToken, hashPublicStatsToken, isPublicStatsToken } from './public-stats'

describe('public stats tokens', () => {
  it('generates unique well-formed tokens', () => {
    const a = generatePublicStatsToken()
    expect(isPublicStatsToken(a)).toBe(true)
    expect(a).not.toBe(generatePublicStatsToken())
  })
  it('rejects malformed tokens', () => {
    for (const t of ['', 'qls_short', 'abc', `qls_${'a'.repeat(44)}`, `qls_${'!'.repeat(43)}`]) expect(isPublicStatsToken(t)).toBe(false)
  })
  it('hashes deterministically without leaking the token', () => {
    const t = generatePublicStatsToken()
    expect(hashPublicStatsToken(t)).toBe(hashPublicStatsToken(t))
    expect(hashPublicStatsToken(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashPublicStatsToken(t)).not.toContain(t)
  })
})
