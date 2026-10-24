import { describe, expect, it } from 'vitest'
import { parseScimFilter, scimFilterMatches } from './scim-filter'

const user = {
  userName: 'Ada@Example.com',
  active: true,
  age: 36,
  emails: [{ value: 'ada@work.io', type: 'work' }, { value: 'ada@home.io', type: 'home' }],
}
const m = (f: string, r: unknown = user) => {
  const p = parseScimFilter(f)
  if (!p) throw new Error('null filter')
  return scimFilterMatches(r, p)
}

describe('scim filter', () => {
  it('returns null for empty input', () => {
    expect(parseScimFilter(null)).toBeNull()
  })
  it('matches eq case-insensitively and co/sw/ew', () => {
    expect(m('userName eq "ada@example.com"')).toBe(true)
    expect(m('userName co "example"')).toBe(true)
    expect(m('userName sw "ada"')).toBe(true)
    expect(m('userName ew ".com"')).toBe(true)
    expect(m('userName ne "ada@example.com"')).toBe(false)
  })
  it('handles booleans, numbers, presence', () => {
    expect(m('active eq true')).toBe(true)
    expect(m('age gt 30 and age lt 40')).toBe(true)
    expect(m('age ge 37')).toBe(false)
    expect(m('userName pr')).toBe(true)
    expect(m('nickName pr')).toBe(false)
  })
  it('supports not, or, grouping and valuePath', () => {
    expect(m('not (active eq false)')).toBe(true)
    expect(m('active eq false or age eq 36')).toBe(true)
    expect(m('emails[type eq "work" and value co "work.io"]')).toBe(true)
    expect(m('emails[type eq "home" and value co "work.io"]')).toBe(false)
  })
  it('rejects malformed, oversized and deeply nested input', () => {
    expect(() => parseScimFilter('userName eq')).toThrow()
    expect(() => parseScimFilter('userName eq "abc')).toThrow()
    expect(() => parseScimFilter('userName bogus "x"')).toThrow()
    expect(() => parseScimFilter('userName eq "' + 'a'.repeat(9000) + '"')).toThrow(/too long/)
    expect(() => parseScimFilter('('.repeat(500) + 'a pr' + ')'.repeat(500))).toThrow()
  })
})
