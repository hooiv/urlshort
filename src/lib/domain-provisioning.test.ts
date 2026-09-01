import { describe, expect, it } from 'vitest'
import { nextTlsState } from './domain-provisioning'
const now = new Date('2026-09-01T00:00:00Z')
describe('TLS renewal state machine', () => {
  it('keeps healthy certificates active', () => expect(nextTlsState({dnsOk:true,probeOk:true,expiresAt:new Date('2026-10-01'),now,providerSucceeded:false})).toBe('active'))
  it('marks certificates inside renewal window due', () => expect(nextTlsState({dnsOk:true,probeOk:true,expiresAt:new Date('2026-09-10'),now,providerSucceeded:false})).toBe('renewal_due'))
  it('does not declare renewal complete merely because provider accepted the request', () => expect(nextTlsState({dnsOk:true,probeOk:true,expiresAt:new Date('2026-09-10'),now,providerSucceeded:true,current:'renewal_due'})).toBe('renewal_in_progress'))
  it('fails expired certificates when provider renewal fails', () => expect(nextTlsState({dnsOk:true,probeOk:true,expiresAt:new Date('2026-08-31'),now,providerSucceeded:false})).toBe('failed'))
  it('never activates when DNS is unverified', () => expect(nextTlsState({dnsOk:false,probeOk:true,expiresAt:new Date('2027-01-01'),now,providerSucceeded:true})).toBe('provisioning'))
})

