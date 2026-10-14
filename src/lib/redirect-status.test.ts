import { describe, expect, it } from 'vitest'
import { assertStatusCompatible, effectiveRedirectStatus, parseRedirectStatus } from './redirect-status'

const none = { hasPassword: false, hasExpiry: false, hasStart: false, hasMaxClicks: false, hasRules: false }
describe('redirect status', () => {
  it('parses numbers and strings, default collapses to null', () => {
    expect(parseRedirectStatus(301)).toBe(301)
    expect(parseRedirectStatus('308')).toBe(308)
    expect(parseRedirectStatus(307)).toBeNull()
    expect(parseRedirectStatus('')).toBeNull()
    expect(parseRedirectStatus(undefined)).toBeNull()
  })
  it('rejects invalid codes', () => {
    for (const bad of [200, 303, '30', 'abc', 301.5, true, {}]) expect(() => parseRedirectStatus(bad)).toThrow(/redirectStatus/)
  })
  it('refuses permanent codes with gates, allows 302', () => {
    expect(() => assertStatusCompatible(301, none)).not.toThrow()
    expect(() => assertStatusCompatible(302, { ...none, hasPassword: true })).not.toThrow()
    expect(() => assertStatusCompatible(308, { ...none, hasExpiry: true, hasMaxClicks: true })).toThrow(/an expiry date, a click limit/)
  })
  it('effective status falls back to 307 for rules and gates', () => {
    expect(effectiveRedirectStatus(301, { ruleMatched: false, gated: false })).toBe(301)
    expect(effectiveRedirectStatus(301, { ruleMatched: true, gated: false })).toBe(307)
    expect(effectiveRedirectStatus(308, { ruleMatched: false, gated: true })).toBe(307)
    expect(effectiveRedirectStatus(null, { ruleMatched: false, gated: false })).toBe(307)
  })
})
