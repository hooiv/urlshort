import { describe, expect, it } from 'vitest'
import {
  activeScheduledDestination, nextScheduledSwap, parseDestinationSchedule, readDestinationSchedule, MAX_DESTINATION_STEPS,
} from './destination-schedule'

const id = (u: string) => {
  if (!u.startsWith('https://')) throw new Error('Only https')
  return u
}

describe('parseDestinationSchedule', () => {
  it('sorts, canonicalises and rejects bad input', () => {
    const r = parseDestinationSchedule([
      { at: '2026-12-02T00:00:00+05:30', url: 'https://b.example' },
      { at: '2026-12-01T00:00:00Z', url: 'https://a.example' },
    ], id)
    expect(r).toEqual({ ok: true, steps: [
      { at: '2026-12-01T00:00:00.000Z', url: 'https://a.example' },
      { at: '2026-12-01T18:30:00.000Z', url: 'https://b.example' },
    ] })
    expect(parseDestinationSchedule([], id)).toEqual({ ok: true, steps: null })
    expect(parseDestinationSchedule(null, id)).toEqual({ ok: true, steps: null })
    expect(parseDestinationSchedule('x', id).ok).toBe(false)
    expect(parseDestinationSchedule([{ at: 'nope', url: 'https://a.example' }], id).ok).toBe(false)
    expect(parseDestinationSchedule([{ at: '2026-01-01T00:00:00Z', url: 'http://a' }], id)).toEqual({ ok: false, error: 'Only https' })
    expect(parseDestinationSchedule([{ at: '2026-01-01T00:00:00Z', url: 'https://a.example' }, { at: '2026-01-01T00:00:00.000Z', url: 'https://b.example' }], id).ok).toBe(false)
    const many = Array.from({ length: MAX_DESTINATION_STEPS + 1 }, (_, i) => ({ at: new Date(i * 1000).toISOString(), url: 'https://a.example' }))
    expect(parseDestinationSchedule(many, id).ok).toBe(false)
  })
})

describe('resolution', () => {
  const stored = [
    { at: '2026-01-01T00:00:00.000Z', url: 'https://one.example' },
    { at: '2026-02-01T00:00:00.000Z', url: 'https://two.example' },
  ]
  it('picks the latest passed step', () => {
    expect(activeScheduledDestination(stored, new Date('2025-12-31T23:59:59Z'))).toBeNull()
    expect(activeScheduledDestination(stored, new Date('2026-01-01T00:00:00Z'))).toBe('https://one.example')
    expect(activeScheduledDestination(stored, new Date('2026-03-01T00:00:00Z'))).toBe('https://two.example')
  })
  it('reports next swap and tolerates corrupt data', () => {
    expect(nextScheduledSwap(stored, new Date('2026-01-15T00:00:00Z'))?.url).toBe('https://two.example')
    expect(nextScheduledSwap(stored, new Date('2027-01-01T00:00:00Z'))).toBeNull()
    expect(readDestinationSchedule('junk')).toEqual([])
    expect(activeScheduledDestination([{ at: 'bad', url: 'x' }, 5], new Date())).toBeNull()
  })
})
