import { describe, expect, it } from 'vitest'
import {
  buildRevokeBody,
  labelSessionDevice,
  validatePasswordChange,
} from './session-utils'

describe('labelSessionDevice', () => {
  it('labels unknown agents', () => {
    expect(labelSessionDevice(null)).toBe('Unknown device')
    expect(labelSessionDevice(undefined)).toBe('Unknown device')
    expect(labelSessionDevice('')).toBe('Unknown device')
  })

  it('labels mobile, windows, mac, and generic browsers', () => {
    expect(labelSessionDevice('Mozilla/5.0 (iPhone; CPU iPhone OS)')).toBe('Mobile device')
    expect(labelSessionDevice('Mozilla/5.0 (Linux; Android 14)')).toBe('Mobile device')
    expect(labelSessionDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows device')
    expect(labelSessionDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('Mac device')
    expect(labelSessionDevice('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Browser session')
  })
})

describe('validatePasswordChange', () => {
  it('requires the current password', () => {
    expect(
      validatePasswordChange({ currentPassword: '', newPassword: 'x'.repeat(12), confirmPassword: 'x'.repeat(12) }),
    ).toBe('Enter your current password')
  })

  it('rejects mismatched confirmation before hitting the network', () => {
    expect(
      validatePasswordChange({ currentPassword: 'old-password-1', newPassword: 'x'.repeat(12), confirmPassword: 'y'.repeat(12) }),
    ).toBe('New passwords do not match')
  })

  it('enforces the 12-character minimum even if HTML validation is bypassed', () => {
    expect(
      validatePasswordChange({ currentPassword: 'old-password-1', newPassword: 'short', confirmPassword: 'short' }),
    ).toBe('New password must be at least 12 characters')
  })

  it('accepts a valid change', () => {
    expect(
      validatePasswordChange({
        currentPassword: 'old-password-1',
        newPassword: 'new-password-12',
        confirmPassword: 'new-password-12',
      }),
    ).toBeNull()
  })
})

describe('buildRevokeBody', () => {
  it('targets one session when an id is given', () => {
    expect(buildRevokeBody('sess_123')).toEqual({ sessionId: 'sess_123' })
    expect(buildRevokeBody('  sess_123  ')).toEqual({ sessionId: 'sess_123' })
  })

  it('targets all other sessions when no id is given', () => {
    expect(buildRevokeBody()).toEqual({})
    expect(buildRevokeBody('   ')).toEqual({})
  })
})
