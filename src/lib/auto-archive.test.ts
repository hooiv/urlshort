import { describe, expect, it } from 'vitest'
import { parseAutoArchiveDays, renderAutoArchiveEmail } from './auto-archive'

describe('auto-archive', () => {
  it('accepts null or a supported window only', () => {
    expect(parseAutoArchiveDays(null)).toBeNull()
    expect(parseAutoArchiveDays(90)).toBe(90)
    expect(parseAutoArchiveDays(45)).toBeUndefined()
    expect(parseAutoArchiveDays('90')).toBeUndefined()
    expect(parseAutoArchiveDays(undefined)).toBeUndefined()
  })
  it('renders a capped summary email with singular/plural subject', () => {
    const one = renderAutoArchiveEmail('Ada', [{ shortCode: 'a', originalUrl: 'https://x.test' }], 60, 'https://q.l')
    expect(one.subject).toBe('1 idle link archived')
    expect(one.text).toContain('Hi Ada')
    const many = renderAutoArchiveEmail(null, Array.from({ length: 25 }, (_, i) => ({ shortCode: `c${i}`, originalUrl: 'https://x.test' })), 30, 'https://q.l')
    expect(many.subject).toBe('25 idle links archived')
    expect(many.text).toContain('...and 5 more')
  })
})
