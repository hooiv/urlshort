import { describe, expect, it } from 'vitest'
import { coarsenIp, sessionOriginFromHeaders } from './session-origin'

describe('session origin', () => {
  it('coarsens IPv4 to /24', () => expect(coarsenIp('203.0.113.77')).toBe('203.0.113.0/24'))
  it('coarsens IPv6 to /48 incl. compressed forms', () => {
    expect(coarsenIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:db8:85a3::/48')
    expect(coarsenIp('2001:db8::1')).toBe('2001:db8:0::/48')
  })
  it('rejects junk', () => {
    expect(coarsenIp('unknown')).toBeNull()
    expect(coarsenIp(null)).toBeNull()
    expect(coarsenIp('::ffff:1.2.3.4')).toBeNull()
  })
  it('reads headers, ignoring invalid countries', () => {
    const h = new Headers({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1', 'cf-ipcountry': 'in' })
    expect(sessionOriginFromHeaders(h)).toEqual({ ipPrefix: '198.51.100.0/24', country: 'IN' })
    expect(sessionOriginFromHeaders(new Headers({ 'cf-ipcountry': 'XX' })).country).toBeNull()
  })
})
