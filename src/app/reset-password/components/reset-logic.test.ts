import { describe, expect, it } from 'vitest'
import {
  doPasswordsMatch,
  getResetSubmitError,
  isValidResetToken,
  validateNewPassword,
} from './reset-logic'

describe('isValidResetToken', () => {
  it('rejects missing or malformed tokens without leaking their value', () => {
    expect(isValidResetToken('')).toBe(false)
    expect(isValidResetToken('short')).toBe(false)
    expect(isValidResetToken('abcdefghijklmnop')).toBe(true)
    expect(isValidResetToken('abc defghijklmnop')).toBe(false)
    expect(isValidResetToken('ab<script>ijklmnopqr')).toBe(false)
  })
})

describe('validateNewPassword', () => {
  it('enforces the 12-character minimum', () => {
    expect(validateNewPassword('short')).toBe('Password must be at least 12 characters')
    expect(validateNewPassword('long-enough-pw')).toBeNull()
  })
})

describe('doPasswordsMatch', () => {
  it('compares passwords exactly', () => {
    expect(doPasswordsMatch('a', 'a')).toBe(true)
    expect(doPasswordsMatch('a', 'b')).toBe(false)
  })
})

describe('getResetSubmitError', () => {
  const token = 'abcdefghijklmnop'
  it('prioritizes token, length, then mismatch errors', () => {
    expect(getResetSubmitError('', 'long-enough-pw', 'long-enough-pw')).toContain('Missing reset token')
    expect(getResetSubmitError('bad token!!', 'long-enough-pw', 'long-enough-pw')).toContain('invalid')
    expect(getResetSubmitError(token, 'short', 'short')).toContain('12 characters')
    expect(getResetSubmitError(token, 'long-enough-pw', 'different-pw!')).toBe('Passwords do not match')
    expect(getResetSubmitError(token, 'long-enough-pw', 'long-enough-pw')).toBeNull()
  })
})
