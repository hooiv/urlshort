import { describe, expect, it } from 'vitest'
import { clientIpFromForwarded } from '@/lib/rate-limit'

describe('clientIpFromForwarded', () => {
  it('legacy: first entry when no trusted hops', () => {
    expect(clientIpFromForwarded('1.1.1.1, 2.2.2.2', null, 0)).toBe('1.1.1.1')
  })
  it('ignores spoofed leading entries when hops configured', () => {
    expect(clientIpFromForwarded('6.6.6.6, 203.0.113.9', null, 1)).toBe('203.0.113.9')
    expect(clientIpFromForwarded('6.6.6.6, 203.0.113.9, 10.0.0.1', null, 2)).toBe('203.0.113.9')
  })
  it('clamps when fewer entries than hops', () => {
    expect(clientIpFromForwarded('203.0.113.9', null, 3)).toBe('203.0.113.9')
  })
  it('falls back to x-real-ip then unknown', () => {
    expect(clientIpFromForwarded(null, '9.9.9.9', 0)).toBe('9.9.9.9')
    expect(clientIpFromForwarded('', null, 0)).toBe('unknown')
  })
})
