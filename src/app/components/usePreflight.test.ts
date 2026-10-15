import { describe, expect, it } from 'vitest'
import { isCheckable, toPreflightState } from './usePreflight'

describe('isCheckable', () => {
  it('accepts full http(s) URLs only', () => {
    expect(isCheckable('https://example.com/a')).toBe(true)
    expect(isCheckable(' http://example.com ')).toBe(true)
    expect(isCheckable('https://localhost')).toBe(false)
    expect(isCheckable('ftp://example.com')).toBe(false)
    expect(isCheckable('exampl')).toBe(false)
    expect(isCheckable('')).toBe(false)
  })
})

describe('toPreflightState', () => {
  it('sorts issues by severity and keeps ok flag', () => {
    const s = toPreflightState({ ok: false, issues: [
      { code: 'duplicate', severity: 'info', message: 'dup' },
      { code: 'unreachable', severity: 'error', message: 'down' },
      { code: 'slow', severity: 'warning', message: 'slow' },
    ] })
    expect(s.status).toBe('done')
    expect(s.ok).toBe(false)
    expect(s.issues.map((i) => i.code)).toEqual(['unreachable', 'slow', 'duplicate'])
  })
  it('drops malformed issues and errors on bad shape', () => {
    expect(toPreflightState({ ok: true, issues: [{ code: 1 }, null, { code: 'x', severity: 'bogus', message: 'm' }] }).issues).toEqual([])
    expect(toPreflightState(null).status).toBe('error')
    expect(toPreflightState({}).status).toBe('error')
  })
})
