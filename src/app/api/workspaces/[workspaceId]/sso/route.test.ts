import { describe, expect, it } from 'vitest'
import { ssoConnectionSchema } from './route'

const base = {
  name: 'Okta',
  idpEntityId: 'https://idp.example.com/entity',
  ssoUrl: 'https://idp.example.com/sso',
  x509Certificate: `-----BEGIN CERTIFICATE-----\n${'A'.repeat(120)}\n-----END CERTIFICATE-----`,
}

describe('ssoConnectionSchema', () => {
  it('accepts a valid https connection', () => {
    expect(ssoConnectionSchema.safeParse(base).success).toBe(true)
  })

  it('rejects plain-http sso urls (downgrade protection)', () => {
    expect(ssoConnectionSchema.safeParse({ ...base, ssoUrl: 'http://idp.example.com/sso' }).success).toBe(false)
  })

  it('rejects missing fields and short certificates', () => {
    expect(ssoConnectionSchema.safeParse({ ...base, name: '' }).success).toBe(false)
    expect(ssoConnectionSchema.safeParse({ ...base, x509Certificate: 'short' }).success).toBe(false)
  })
})
