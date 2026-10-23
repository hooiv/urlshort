import { describe, expect, it } from 'vitest'
import { groupSlugCollisions, parseSlugCollisionsLimit, slugCollisionKey } from './slug-collisions'

const l = (shortCode: string, clicks: number, originalUrl = 'https://a.com') => ({ id: shortCode, shortCode, clicks, originalUrl })

describe('slug collisions', () => {
  it('builds a case and separator insensitive key', () => {
    expect(slugCollisionKey('Spring-Sale_1')).toBe('springsale1')
  })
  it('groups only colliding codes, busiest group first', () => {
    const g = groupSlugCollisions([l('Promo', 5), l('promo', 50, 'https://b.com'), l('solo', 99), l('a-b', 1), l('AB', 2)])
    expect(g.map((x) => x.key)).toEqual(['promo', 'ab'])
    expect(g[0].links.map((x) => x.shortCode)).toEqual(['promo', 'Promo'])
    expect(g[0].sameDestination).toBe(false)
    expect(g[1].sameDestination).toBe(true)
  })
  it('returns nothing without collisions', () => {
    expect(groupSlugCollisions([l('a', 1), l('b', 2)])).toEqual([])
  })
  it('validates limit', () => {
    expect(parseSlugCollisionsLimit(null)).toBe(50)
    expect(parseSlugCollisionsLimit('0')).toBeNull()
    expect(parseSlugCollisionsLimit('101')).toBeNull()
    expect(parseSlugCollisionsLimit('x')).toBeNull()
  })
})
