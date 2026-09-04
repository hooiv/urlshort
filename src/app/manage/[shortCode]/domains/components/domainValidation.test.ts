import { describe, expect, it } from 'vitest'
import {
  buildBrandedUrl,
  manageTokenKey,
  readSessionToken,
  validateDomainForm,
  validateDomainPath,
  validateHostname,
} from './domainValidation'

describe('validateHostname', () => {
  it('accepts public hostnames and normalizes case and trailing dots', () => {
    expect(validateHostname('go.example.com')).toEqual({ value: 'go.example.com' })
    expect(validateHostname('  GO.Example.COM. ')).toEqual({ value: 'go.example.com' })
  })

  it('rejects missing, malformed, and private hosts', () => {
    expect(validateHostname('   ')).toEqual({ error: 'Enter a domain host' })
    expect(validateHostname('https://example.com/path')).toEqual({ error: 'Enter a valid hostname' })
    expect(validateHostname('example.com:8080')).toEqual({ error: 'Enter a valid hostname' })
    expect(validateHostname('localhost')).toEqual({ error: 'Private hostnames are not allowed' })
    expect(validateHostname('app.internal')).toEqual({ error: 'Private hostnames are not allowed' })
    expect(validateHostname('not a host')).toEqual({
      error: 'Enter a public hostname such as go.example.com',
    })
    expect(validateHostname('bareword')).toEqual({
      error: 'Enter a public hostname such as go.example.com',
    })
  })
})

describe('validateDomainPath', () => {
  it('accepts backhalf paths and adds a missing leading slash', () => {
    expect(validateDomainPath('/summer-sale')).toEqual({ value: '/summer-sale' })
    expect(validateDomainPath('summer-sale')).toEqual({ value: '/summer-sale' })
  })

  it('rejects empty and malformed paths', () => {
    expect(validateDomainPath('   ')).toEqual({ error: 'Enter a path such as /summer-sale' })
    expect(validateDomainPath('/')).toEqual({ error: 'Path must look like /summer-sale' })
    expect(validateDomainPath('/has space')).toEqual({ error: 'Path must look like /summer-sale' })
    expect(validateDomainPath('/a/b')).toEqual({ error: 'Path must look like /summer-sale' })
  })
})

describe('validateDomainForm', () => {
  it('returns normalized values for valid input', () => {
    expect(validateDomainForm('Go.Example.com', 'promo')).toEqual({
      ok: true,
      host: 'go.example.com',
      path: '/promo',
    })
  })

  it('reports the hostname problem first', () => {
    expect(validateDomainForm('', '/bad path!!')).toEqual({ ok: false, error: 'Enter a domain host' })
    expect(validateDomainForm('go.example.com', '/bad path!!')).toEqual({
      ok: false,
      error: 'Path must look like /summer-sale',
    })
  })
})

describe('buildBrandedUrl / token helpers', () => {
  it('builds the canonical https branded URL', () => {
    expect(buildBrandedUrl('go.example.com', '/promo')).toBe('https://go.example.com/promo')
  })

  it('scopes management tokens per short code', () => {
    expect(manageTokenKey('abc')).toBe('ql-token:abc')
  })

  it('returns null outside the browser instead of throwing', () => {
    expect(readSessionToken('ql-token:abc')).toBeNull()
  })
})
