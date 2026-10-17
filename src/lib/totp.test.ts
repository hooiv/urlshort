import { describe, expect, it, beforeAll } from 'vitest'
import { base32Decode, base32Encode, decryptSecret, encryptSecret, generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode, otpauthUri, totpCode, verifyTotp } from './totp'

// RFC 6238 appendix B secret "12345678901234567890" (SHA-1), 8-digit vectors truncated to 6.
const SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('totp', () => {
  beforeAll(() => { process.env.QL_MFA_KEY = 'k'.repeat(40) })
  it('base32 round-trips and matches RFC 4648', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI')
    expect(base32Decode('MZXW6YTBOI===').toString()).toBe('foobar')
    expect(() => base32Decode('!!')).toThrow()
  })
  it('matches RFC 6238 vectors', () => {
    expect(totpCode(SECRET, Math.floor(59 / 30))).toBe('287082')
    expect(totpCode(SECRET, Math.floor(1111111109 / 30))).toBe('081804')
    expect(totpCode(SECRET, Math.floor(2000000000 / 30))).toBe('279037')
  })
  it('verifies within window and rejects outside', () => {
    const now = 1111111109 * 1000
    expect(verifyTotp(SECRET, '081804', { now })).toBe(Math.floor(1111111109 / 30))
    expect(verifyTotp(SECRET, '081 804', { now: now + 30_000 })).not.toBeNull()
    expect(verifyTotp(SECRET, '081804', { now: now + 120_000 })).toBeNull()
    expect(verifyTotp(SECRET, 'abcdef', { now })).toBeNull()
  })
  it('rejects replay of the same step', () => {
    const now = 1111111109 * 1000
    const c = verifyTotp(SECRET, '081804', { now })!
    expect(verifyTotp(SECRET, '081804', { now, lastUsedCounter: c })).toBeNull()
  })
  it('builds otpauth uri', () => {
    const u = new URL(otpauthUri('ABC', 'a@b.co'))
    expect(u.protocol).toBe('otpauth:')
    expect(u.searchParams.get('secret')).toBe('ABC')
    expect(decodeURIComponent(u.pathname)).toContain('a@b.co')
  })
  it('encrypts secrets and detects tampering', () => {
    const blob = encryptSecret(SECRET)
    expect(blob).not.toContain(SECRET)
    expect(decryptSecret(blob)).toBe(SECRET)
    const parts = blob.split('.'); parts[3] = Buffer.from('zzzz').toString('base64url')
    expect(() => decryptSecret(parts.join('.'))).toThrow()
  })
  it('recovery codes are unique, normalised, hashed', () => {
    const codes = generateRecoveryCodes()
    expect(new Set(codes).size).toBe(10)
    expect(codes[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    expect(hashRecoveryCode(codes[0].toLowerCase())).toBe(hashRecoveryCode(codes[0]))
    expect(normalizeRecoveryCode('ab-cd ef')).toBe('ABCDEF')
  })
})
