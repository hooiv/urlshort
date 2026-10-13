import { describe, expect, it } from 'vitest'
import { groupDuplicates, normalizeDestination, parseDuplicatesLimit } from './duplicate-links'

const row = (id: string, originalUrl: string, clicks: number, day = 1) => ({ id, shortCode: id, title: null, originalUrl, clicks, createdAt: new Date(Date.UTC(2026, 0, day)) })

describe('duplicate destinations', () => {
  it('normalises equivalent URLs', () => {
    const want = 'example.com/a?a=1&b=2'
    expect(normalizeDestination('https://WWW.Example.com/a/?b=2&a=1&utm_source=x&fbclid=z#top')).toBe(want)
    expect(normalizeDestination('http://example.com:80/a?a=1&b=2')).toBe(want)
    expect(normalizeDestination('https://example.com:8443/')).toBe('example.com:8443')
    expect(normalizeDestination('https://example.com/a?id=1')).not.toBe(normalizeDestination('https://example.com/a?id=2'))
    expect(normalizeDestination('ftp://x.test')).toBeNull()
    expect(normalizeDestination('not a url')).toBeNull()
  })
  it('groups, picks the most clicked as keep, ranks by size', () => {
    const g = groupDuplicates([
      row('a', 'https://x.test/p', 5, 3), row('b', 'https://www.x.test/p/?utm_medium=e', 9, 2), row('c', 'https://x.test/p', 9, 1),
      row('d', 'https://y.test/', 1), row('e', 'https://y.test', 1, 2), row('solo', 'https://z.test', 100), row('bad', 'nope', 1),
    ], 10)
    expect(g.map((x) => x.destination)).toEqual(['x.test/p', 'y.test'])
    expect(g[0]).toMatchObject({ count: 3, totalClicks: 23, keep: 'c' })
    expect(g[1].keep).toBe('d')
  })
  it('limits groups and parses limit', () => {
    expect(groupDuplicates([row('a', 'https://a.t', 1), row('b', 'https://a.t', 1), row('c', 'https://b.t', 1), row('d', 'https://b.t', 1)], 1)).toHaveLength(1)
    expect(parseDuplicatesLimit(null)).toBe(25)
    expect(parseDuplicatesLimit('100')).toBe(100)
    expect(parseDuplicatesLimit('101')).toBeNull()
    expect(parseDuplicatesLimit('x')).toBeNull()
  })
})

import { archiveTargets as _archiveTargets } from './duplicate-links'
import { describe as d2, it as i2, expect as e2 } from 'vitest'
d2('archiveTargets', () => {
  const g = { links: [{ id: 'a', shortCode: 'aa' }, { id: 'b', shortCode: 'bb' }, { id: 'c', shortCode: 'cc' }] } as never
  i2('excludes the kept link', () => e2(_archiveTargets(g, 'b')).toEqual(['aa', 'cc']))
  i2('returns nothing for an unknown keeper', () => e2(_archiveTargets(g, 'zzz')).toEqual([]))
})
