import { describe, expect, it } from 'vitest'
import { evaluateLinkPolicy, hostMatches, linkPolicySchema } from './link-policy'

const base = linkPolicySchema.parse({})
const now = new Date('2026-10-14T00:00:00Z')
const rules = (p: object, l: Parameters<typeof evaluateLinkPolicy>[1]) =>
  evaluateLinkPolicy(linkPolicySchema.parse(p), l, now).map((v) => v.rule)

describe('link policy', () => {
  it('passes an empty policy', () => {
    expect(evaluateLinkPolicy(base, { destination: 'http://a.com' }, now)).toEqual([])
  })
  it('matches subdomains but not suffix lookalikes', () => {
    expect(hostMatches('a.example.com', 'example.com')).toBe(true)
    expect(hostMatches('evilexample.com', 'example.com')).toBe(false)
    expect(hostMatches('x.example.com', '*.example.com')).toBe(true)
  })
  it('enforces allow and block lists', () => {
    expect(rules({ allowedDestinationHosts: ['acme.com'] }, { destination: 'https://other.com' })).toEqual(['allowed_host'])
    expect(rules({ allowedDestinationHosts: ['acme.com'] }, { destination: 'https://shop.acme.com' })).toEqual([])
    expect(rules({ blockedDestinationHosts: ['bad.io'] }, { destination: 'https://x.bad.io' })).toEqual(['blocked_host'])
  })
  it('enforces https, tags and slug rules', () => {
    expect(rules({ requireHttps: true }, { destination: 'http://a.com' })).toEqual(['https'])
    expect(rules({ requiredTags: ['Campaign'] }, { destination: 'https://a.com', tags: ['campaign'] })).toEqual([])
    expect(rules({ requiredTags: ['a', 'b'] }, { destination: 'https://a.com', tags: ['a'] })).toEqual(['required_tags'])
    expect(rules({ slugPrefix: 'acme-', minSlugLength: 8 }, { destination: 'https://a.com', shortCode: 'x' })).toEqual(['slug_prefix', 'slug_length'])
  })
  it('enforces expiry rules', () => {
    expect(rules({ requireExpiry: true }, { destination: 'https://a.com' })).toEqual(['expiry_required'])
    expect(rules({ maxExpiryDays: 30 }, { destination: 'https://a.com' })).toEqual([])
    expect(rules({ maxExpiryDays: 30 }, { destination: 'https://a.com', expiresAt: new Date('2026-12-31') })).toEqual(['expiry_too_far'])
    expect(rules({ maxExpiryDays: 30 }, { destination: 'https://a.com', expiresAt: new Date('2026-10-20') })).toEqual([])
  })
  it('flags invalid urls', () => {
    expect(rules({}, { destination: 'nope' })).toEqual(['invalid_url'])
  })
})
