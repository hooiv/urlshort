import { describe, expect, it } from 'vitest'
import { scryptSync } from 'node:crypto'
import { hashGatePassword, verifyGatePassword } from './password-gate'

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
