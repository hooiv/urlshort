import { describe, expect, it } from 'vitest'
import { isDeepLinkAccessible } from './route'

describe('isDeepLinkAccessible', () => {
  it('allows healthy links', () => {
    expect(isDeepLinkAccessible({ isActive: true, expiresAt: null, riskStatus: 'cleared', passwordHash: null })).toEqual({ allowed: true })
  })

  it('blocks inactive, gated, expired, and protected links without leaking', () => {
    expect(isDeepLinkAccessible({ isActive: false, expiresAt: null, riskStatus: 'cleared', passwordHash: null }).allowed).toBe(false)
    expect(isDeepLinkAccessible({ isActive: true, expiresAt: null, riskStatus: 'blocked', passwordHash: null }).reason).toBe('link_blocked')
    expect(isDeepLinkAccessible({ isActive: true, expiresAt: new Date('2000-01-01'), riskStatus: 'cleared', passwordHash: null }).reason).toBe('link_expired')
    expect(isDeepLinkAccessible({ isActive: true, expiresAt: null, riskStatus: 'cleared', passwordHash: 'scrypt$x$y' }).reason).toBe('password_required')
  })
})
