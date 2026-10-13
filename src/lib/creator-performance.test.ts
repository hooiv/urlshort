import { describe, expect, it } from 'vitest'
import { creatorDisplayName, parseCreatorWindow, shapeCreatorStats } from './creator-performance'

describe('parseCreatorWindow', () => {
  it('defaults and validates', () => {
    expect(parseCreatorWindow(null)).toBe(30)
    expect(parseCreatorWindow('90')).toBe(90)
    expect(parseCreatorWindow('14')).toBeNull()
  })
})

describe('creatorDisplayName', () => {
  it('prefers name, never leaks the full email', () => {
    expect(creatorDisplayName(' Ada ', 'a@b.com')).toBe('Ada')
    expect(creatorDisplayName(null, 'ada@example.com')).toBe('ada')
    expect(creatorDisplayName(null, null)).toBe('Unknown')
  })
})

describe('shapeCreatorStats', () => {
  it('ranks by clicks, computes share and change', () => {
    const out = shapeCreatorStats([
      { userId: 'a', name: 'A', email: null, totalLinks: 5n, newLinks: 2n, clicks: 30n, previous: 10n },
      { userId: 'b', name: null, email: 'b@x.io', totalLinks: 1, newLinks: 0, clicks: 70, previous: 0 },
    ])
    expect(out[0]).toMatchObject({ userId: 'b', name: 'b', sharePct: 70, changePct: null })
    expect(out[1]).toMatchObject({ userId: 'a', totalLinks: 5, newLinks: 2, changePct: 200, sharePct: 30 })
  })
})
