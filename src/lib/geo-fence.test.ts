import { describe, expect, it } from 'vitest'
import { isCountryAllowed, parseGeoFence } from './geo-fence'

describe('parseGeoFence', () => {
  it('clears on null and on empty deny list', () => {
    expect(parseGeoFence(null)).toEqual({ ok: true, fence: null })
    expect(parseGeoFence({ mode: 'deny', countries: [] })).toEqual({ ok: true, fence: null })
  })
  it('normalizes, dedupes and sorts', () => {
    expect(parseGeoFence({ mode: 'allow', countries: ['us', ' de', 'US'] })).toEqual({ ok: true, fence: { mode: 'allow', countries: ['DE', 'US'] } })
  })
  it('rejects bad input', () => {
    expect(parseGeoFence('x').ok).toBe(false)
    expect(parseGeoFence({ mode: 'x', countries: [] }).ok).toBe(false)
    expect(parseGeoFence({ mode: 'allow', countries: [] }).ok).toBe(false)
    expect(parseGeoFence({ mode: 'deny', countries: ['USA'] }).ok).toBe(false)
    expect(parseGeoFence({ mode: 'deny', countries: [1] }).ok).toBe(false)
    expect(parseGeoFence({ mode: 'deny', countries: ['US'], allowUnknown: 'y' }).ok).toBe(false)
  })
})

describe('isCountryAllowed', () => {
  const allow = { mode: 'allow' as const, countries: ['US'] }
  const deny = { mode: 'deny' as const, countries: ['RU'] }
  it('no fence allows all', () => {
    expect(isCountryAllowed(null, 'RU')).toBe(true)
  })
  it('allow-list', () => {
    expect(isCountryAllowed(allow, 'us')).toBe(true)
    expect(isCountryAllowed(allow, 'FR')).toBe(false)
  })
  it('deny-list', () => {
    expect(isCountryAllowed(deny, 'RU')).toBe(false)
    expect(isCountryAllowed(deny, 'FR')).toBe(true)
  })
  it('unknown country defaults by mode and can be overridden', () => {
    expect(isCountryAllowed(allow, null)).toBe(false)
    expect(isCountryAllowed(deny, 'XX')).toBe(true)
    expect(isCountryAllowed({ ...allow, allowUnknown: true }, undefined)).toBe(true)
    expect(isCountryAllowed({ ...deny, allowUnknown: false }, 'T1')).toBe(false)
  })
})
