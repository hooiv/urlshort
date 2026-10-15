import { describe, expect, it } from 'vitest'
import { classifyDrop, shapeDrops } from './click-drops'

describe('classifyDrop', () => {
  it('ignores low-traffic links', () => expect(classifyDrop(0, 19)).toBeNull())
  it('flags silence, drops and dips; ignores healthy', () => {
    expect(classifyDrop(0, 50)).toBe('silent')
    expect(classifyDrop(5, 50)).toBe('drop')
    expect(classifyDrop(15, 50)).toBe('dip')
    expect(classifyDrop(21, 50)).toBeNull()
  })
})

describe('shapeDrops', () => {
  it('ranks by lost clicks and computes baseline per window', () => {
    const rows = [
      { id: 'a', shortCode: 'a', title: null, originalUrl: 'u', recent: 0, baseline: 14 * 30 },
      { id: 'b', shortCode: 'b', title: null, originalUrl: 'u', recent: BigInt(10), baseline: BigInt(14 * 100) },
      { id: 'c', shortCode: 'c', title: null, originalUrl: 'u', recent: 40, baseline: 14 * 40 },
    ]
    const out = shapeDrops(rows, 24)
    expect(out.map((d) => d.id)).toEqual(['b', 'a'])
    expect(out[0]).toMatchObject({ baselinePerWindow: 100, ratio: 0.1, severity: 'drop' })
    expect(out[1].severity).toBe('silent')
  })
})
