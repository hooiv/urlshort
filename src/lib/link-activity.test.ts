import { describe, expect, it } from 'vitest'
import { decodeCursor, diffSnapshots, encodeCursor, parseLimit } from './link-activity'

describe('link activity', () => {
  it('diffs only changed fields and redacts secrets', () => {
    const d = diffSnapshots(JSON.stringify({ a: 1, b: 2, passwordHash: 'x' }), JSON.stringify({ a: 1, b: 3, passwordHash: 'y', c: [1] }))
    expect(d).toEqual([
      { field: 'b', before: 2, after: 3 },
      { field: 'c', before: null, after: [1] },
      { field: 'passwordHash', before: '[redacted]', after: '[redacted]' },
    ])
  })
  it('tolerates missing or malformed snapshots', () => {
    expect(diffSnapshots(null, null)).toEqual([])
    expect(diffSnapshots('nope', '[1]')).toEqual([])
    expect(diffSnapshots(null, '{"x":1}')).toEqual([{ field: 'x', before: null, after: 1 }])
  })
  it('clamps limits', () => {
    expect(parseLimit(null)).toBe(25)
    expect(parseLimit('abc')).toBe(25)
    expect(parseLimit('0')).toBe(25)
    expect(parseLimit('1000')).toBe(100)
    expect(parseLimit('7')).toBe(7)
  })
  it('round-trips cursors and rejects garbage', () => {
    const d = new Date('2026-10-13T10:00:00.123Z')
    expect(decodeCursor(encodeCursor(d, 'cabc:1'))).toEqual({ createdAt: d, id: 'cabc:1' })
    expect(decodeCursor(null)).toBeNull()
    expect(decodeCursor('!!')).toBe('invalid')
    expect(decodeCursor(Buffer.from('abc:x').toString('base64url'))).toBe('invalid')
  })
})
