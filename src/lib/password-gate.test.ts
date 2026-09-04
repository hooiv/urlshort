import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scryptSync } from 'node:crypto'
import { createUnlockToken, hashGatePassword, verifyGatePassword, verifyUnlockToken } from './password-gate'

describe('password gate hashing', () => {
  it('uses a unique salt for every password hash', () => {
    const a = hashGatePassword('correct horse battery staple')
    const b = hashGatePassword('correct horse battery staple')
    expect(a).not.toBe(b)
    expect(a.startsWith('scrypt$')).toBe(true)
  })

  it('verifies current hashes and rejects wrong passwords', () => {
    const hash = hashGatePassword('secret-123')
    expect(verifyGatePassword('secret-123', hash)).toBe(true)
    expect(verifyGatePassword('wrong', hash)).toBe(false)
  })

  it('continues to support legacy fixed-salt hashes during migration', () => {
    const legacy = scryptSync('legacy-password', 'ql_salt', 64).toString('hex')
    expect(verifyGatePassword('legacy-password', legacy)).toBe(true)
  })
})

describe('password unlock tokens', () => {
  beforeAll(() => {
    process.env.QL_ATTRIBUTION_SECRET = 'test-secret-that-is-definitely-32-chars-long!!'
  })

  afterAll(() => {
    delete process.env.QL_ATTRIBUTION_SECRET
  })

  it('round-trips and rejects foreign or tampered tokens in constant time', () => {
    const token = createUnlockToken('abc123')
    expect(verifyUnlockToken('abc123', token)).toBe(true)
    // Token for a different link must not unlock this one.
    expect(verifyUnlockToken('other', token)).toBe(false)
    // Single-character tampering must fail.
    expect(verifyUnlockToken('abc123', `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`)).toBe(false)
    expect(verifyUnlockToken('abc123', null)).toBe(false)
    expect(verifyUnlockToken('abc123', '')).toBe(false)
  })
})
