import { describe, expect, it } from 'vitest'
import { assertValidWindow, linkWindowState, notStartedTarget, parseStartsAt } from './link-schedule'

const t = (s: string) => new Date(s)
describe('link-schedule', () => {
  it('parses empty and rejects garbage', () => {
    expect(parseStartsAt(null)).toBeNull()
    expect(parseStartsAt('')).toBeNull()
    expect(parseStartsAt('2026-12-01T10:00:00Z')?.toISOString()).toBe('2026-12-01T10:00:00.000Z')
    expect(() => parseStartsAt('nope')).toThrow('Invalid start date')
  })
  it('rejects inverted or empty windows', () => {
    expect(() => assertValidWindow(t('2026-12-02'), t('2026-12-01'))).toThrow()
    expect(() => assertValidWindow(t('2026-12-01'), t('2026-12-01'))).toThrow()
    expect(() => assertValidWindow(t('2026-12-01'), null)).not.toThrow()
    expect(() => assertValidWindow(null, t('2026-12-01'))).not.toThrow()
  })
  it('classifies the window with inclusive boundaries', () => {
    const l = { startsAt: t('2026-12-01T00:00:00Z'), expiresAt: t('2026-12-10T00:00:00Z') }
    expect(linkWindowState(l, t('2026-11-30T23:59:59Z'))).toBe('scheduled')
    expect(linkWindowState(l, t('2026-12-01T00:00:00Z'))).toBe('live')
    expect(linkWindowState(l, t('2026-12-10T00:00:00Z'))).toBe('live')
    expect(linkWindowState(l, t('2026-12-10T00:00:01Z'))).toBe('expired')
    expect(linkWindowState({}, t('2030-01-01'))).toBe('live')
  })
  it('picks the teaser target', () => {
    expect(notStartedTarget({ notStartedUrl: 'https://x.test/soon' }, 'https://ql.test')).toBe('https://x.test/soon')
    expect(notStartedTarget({}, 'https://ql.test')).toBe('https://ql.test/coming-soon')
  })
})
