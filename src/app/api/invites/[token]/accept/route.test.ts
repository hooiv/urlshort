import { describe, expect, it } from 'vitest'
import { isAcceptableInviteToken } from './route'

describe('isAcceptableInviteToken', () => {
  it('accepts normal tokens', () => {
    expect(isAcceptableInviteToken('abc123')).toBe(true)
  })

  it('rejects empty, non-string, or oversized tokens', () => {
    expect(isAcceptableInviteToken('')).toBe(false)
    expect(isAcceptableInviteToken(undefined)).toBe(false)
    expect(isAcceptableInviteToken('x'.repeat(513))).toBe(false)
  })
})
