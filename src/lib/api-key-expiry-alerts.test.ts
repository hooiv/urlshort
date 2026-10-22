import { describe, it, expect } from 'vitest'
import { renderExpiryWarning } from './api-key-expiry-alerts'

const now = new Date('2026-10-23T00:00:00Z')
describe('renderExpiryWarning', () => {
  it('singular subject and day count', () => {
    const r = renderExpiryWarning('Ada', [{ id: 'a', name: 'CI', prefix: 'abc', expiresAt: new Date('2026-10-24T00:00:00Z') }], 'https://x.io', now)
    expect(r.subject).toBe('API key "CI" expires soon')
    expect(r.text).toContain('Hi Ada')
    expect(r.text).toContain('in 1 day)')
  })
  it('plural, sorted by soonest', () => {
    const r = renderExpiryWarning(null, [
      { id: 'b', name: 'Late', prefix: 'b', expiresAt: new Date('2026-11-01T00:00:00Z') },
      { id: 'a', name: 'Soon', prefix: 'a', expiresAt: new Date('2026-10-25T00:00:00Z') },
    ], 'https://x.io', now)
    expect(r.subject).toBe('2 API keys expire soon')
    expect(r.text.indexOf('Soon')).toBeLessThan(r.text.indexOf('Late'))
  })
})
