import { describe, expect, it } from 'vitest'
import { buildConsentCookie, parseConsentChoice, shouldShowConsentBanner } from './consent-logic'

describe('parseConsentChoice', () => {
  it('reads exact ql_consent cookie', () => {
    expect(parseConsentChoice('ql_consent=analytics')).toBe('analytics')
    expect(parseConsentChoice('ql_consent=essential')).toBe('essential')
    expect(parseConsentChoice('a=1; ql_consent=analytics; b=2')).toBe('analytics')
  })
  it('rejects missing, unknown, or lookalike cookies', () => {
    expect(parseConsentChoice(null)).toBeNull()
    expect(parseConsentChoice('')).toBeNull()
    expect(parseConsentChoice('other=1')).toBeNull()
    expect(parseConsentChoice('foo=ql_consent=analytics')).toBeNull()
    expect(parseConsentChoice('ql_consent=tracking')).toBeNull()
    expect(parseConsentChoice('ql_consent=')).toBeNull()
  })
})

describe('shouldShowConsentBanner', () => {
  it('shows only until a valid choice is stored', () => {
    expect(shouldShowConsentBanner('')).toBe(true)
    expect(shouldShowConsentBanner('ql_consent=essential')).toBe(false)
    expect(shouldShowConsentBanner('ql_consent=analytics')).toBe(false)
  })
})

describe('buildConsentCookie', () => {
  it('never sets tracking state, only the choice marker', () => {
    expect(buildConsentCookie('essential')).toBe('ql_consent=essential; Max-Age=31536000; Path=/; SameSite=Lax')
    expect(buildConsentCookie('analytics')).toBe('ql_consent=analytics; Max-Age=31536000; Path=/; SameSite=Lax')
  })
})
