import { describe, expect, it } from 'vitest'
import { getInvalidTokenError, getMissingTokenError, isValidVerifyToken } from './verify-logic'

describe('isValidVerifyToken', () => {
  it('accepts well-formed tokens and rejects blanks or injected values', () => {
    expect(isValidVerifyToken('')).toBe(false)
    expect(isValidVerifyToken('short')).toBe(false)
    expect(isValidVerifyToken('abcdefghijklmnop')).toBe(true)
    expect(isValidVerifyToken('abc defghijklmnop')).toBe(false)
    expect(isValidVerifyToken('ab<script>ijklmnopqr')).toBe(false)
  })
})

describe('verify token errors', () => {
  it('returns stable copy for missing and invalid links', () => {
    expect(getMissingTokenError()).toContain('missing its verification token')
    expect(getInvalidTokenError()).toContain('looks invalid')
  })
})
