import { describe, expect, it } from 'vitest'
import { validateDomainSettings } from './domain-settings'

describe('validateDomainSettings', () => {
  it('accepts valid urls and null to clear', () => {
    const out = validateDomainSettings({ rootRedirectUrl: 'https://acme.com/', notFoundUrl: null }, 'go.acme.io')
    expect(out).toEqual({ ok: true, value: { rootRedirectUrl: 'https://acme.com/', notFoundUrl: null } })
  })
  it('treats empty string as clear', () => {
    expect(validateDomainSettings({ notFoundUrl: '' }, 'go.acme.io')).toEqual({ ok: true, value: { notFoundUrl: null } })
  })
  it('rejects loops to the same domain, including www', () => {
    expect(validateDomainSettings({ rootRedirectUrl: 'https://www.go.acme.io/x' }, 'go.acme.io').ok).toBe(false)
  })
  it('rejects non-http, credentials, unknown fields, empty and non-object bodies', () => {
    for (const body of [{ rootRedirectUrl: 'javascript:alert(1)' }, { rootRedirectUrl: 'https://u:p@acme.com' }, { rootRedirectUrl: 'nope' }, { rootRedirectUrl: 5 }, { other: 1 }, {}, [], null]) {
      expect(validateDomainSettings(body, 'go.acme.io').ok).toBe(false)
    }
  })
  it('rejects risky destinations', () => {
    expect(validateDomainSettings({ notFoundUrl: 'http://127.0.0.1/admin' }, 'go.acme.io').ok).toBe(false)
  })
})
