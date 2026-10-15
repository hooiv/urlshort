import { describe, expect, it } from 'vitest'
import { insecureShare, parseInsecureLimit, toHttpsUrl } from './insecure-links'

describe('insecure links helpers', () => {
  it('upgrades http to https and keeps path, query and hash', () => {
    expect(toHttpsUrl('http://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c')
    expect(toHttpsUrl('HTTP://Example.com:80/x')).toBe('https://example.com/x')
    expect(toHttpsUrl('http://example.com:8080/x')).toBe('https://example.com:8080/x')
  })
  it('returns null for non-http or invalid urls', () => {
    expect(toHttpsUrl('https://example.com')).toBeNull()
    expect(toHttpsUrl('ftp://example.com')).toBeNull()
    expect(toHttpsUrl('not a url')).toBeNull()
  })
  it('validates limits', () => {
    expect(parseInsecureLimit(null)).toBe(50)
    expect(parseInsecureLimit('200')).toBe(200)
    expect(parseInsecureLimit('0')).toBeNull()
    expect(parseInsecureLimit('201')).toBeNull()
    expect(parseInsecureLimit('1e2')).toBeNull()
  })
  it('computes share', () => {
    expect(insecureShare(1, 3)).toBe(33)
    expect(insecureShare(0, 0)).toBe(0)
  })
})
