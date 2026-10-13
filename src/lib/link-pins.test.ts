import { describe, expect, it } from 'vitest'
import { MAX_PINNED_LINKS, parsePinned, pinnedFirst } from './link-pins'

describe('link pins', () => {
  it('maps booleans to timestamps and rejects other types', () => {
    const now = new Date('2026-10-14T00:00:00Z')
    expect(parsePinned(true, now)).toEqual(now)
    expect(parsePinned(false, now)).toBeNull()
    expect(() => parsePinned('yes')).toThrow('pinned must be a boolean')
    expect(() => parsePinned(undefined)).toThrow()
  })
  it('puts pinned rows first without duplicates', () => {
    const merged = pinnedFirst([{ id: 'p' }, { id: 'q' }], [{ id: 'a' }, { id: 'p' }, { id: 'b' }], 3)
    expect(merged.map((r) => r.id)).toEqual(['p', 'q', 'a'])
  })
  it('never truncates pinned rows and caps are sane', () => {
    const pins = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }))
    expect(pinnedFirst(pins, [{ id: 'x' }], 2)).toHaveLength(5)
    expect(MAX_PINNED_LINKS).toBeGreaterThan(0)
  })
})
