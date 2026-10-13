import { describe, expect, it } from 'vitest'
import { parseTagWindow, shapeTagStats } from './tag-performance'

describe('parseTagWindow', () => {
  it('defaults and validates', () => {
    expect(parseTagWindow(null)).toBe(30)
    expect(parseTagWindow('7')).toBe(7)
    expect(parseTagWindow('90')).toBe(90)
    expect(parseTagWindow('14')).toBeNull()
    expect(parseTagWindow('abc')).toBeNull()
  })
})

describe('shapeTagStats', () => {
  it('computes change, share and orders by clicks then tag', () => {
    const out = shapeTagStats([
      { tag: 'b', links: 2n, clicks: 30n, previous: 20n },
      { tag: 'a', links: 1, clicks: 30, previous: 0 },
      { tag: 'c', links: 1, clicks: 40, previous: 80 },
    ])
    expect(out.map((t) => t.tag)).toEqual(['c', 'a', 'b'])
    expect(out[0]).toMatchObject({ changePct: -50, sharePct: 40 })
    expect(out[1].changePct).toBeNull()
    expect(out[2]).toMatchObject({ changePct: 50, links: 2 })
  })
  it('handles zero traffic', () => {
    expect(shapeTagStats([{ tag: 'x', links: 1, clicks: 0, previous: 0 }])[0]).toMatchObject({ sharePct: 0, changePct: null })
  })
})
