import { describe, expect, it } from 'vitest'
import { erasureWhere, parseErasureSubject } from './visitor-erasure'
import { hashWithWorkspace } from './privacy-ingestion'

describe('visitor erasure subject', () => {
  it('requires an identifier', () => {
    expect(parseErasureSubject({}, 'w1')).toEqual({ error: 'Provide an ip or a visitorId' })
    expect(parseErasureSubject({ ip: '  ' }, 'w1')).toEqual({ error: 'Provide an ip or a visitorId' })
  })
  it('rejects non-literal IPs', () => {
    expect(parseErasureSubject({ ip: 'bob@example.com' }, 'w1')).toEqual({ error: 'ip must be a literal IPv4 or IPv6 address' })
  })
  it('matches both raw and workspace-salted forms', () => {
    const p = parseErasureSubject({ ip: '203.0.113.9', visitorId: 'v1' }, 'w1')
    expect(p).toEqual({ ips: ['203.0.113.9', hashWithWorkspace('203.0.113.9', 'w1')], visitorIds: ['v1', hashWithWorkspace('v1', 'w1')] })
  })
  it('salts per workspace so another workspace hash never matches', () => {
    const a = parseErasureSubject({ ip: '203.0.113.9' }, 'w1') as { ips: string[] }
    const b = parseErasureSubject({ ip: '203.0.113.9' }, 'w2') as { ips: string[] }
    expect(a.ips[1]).not.toBe(b.ips[1])
  })
  it('scopes the delete to the workspace', () => {
    const w = erasureWhere('w1', { ips: ['1.1.1.1'], visitorIds: [] })
    expect(w.url).toEqual({ workspaceId: 'w1' })
    expect(w.OR).toEqual([{ ip: { in: ['1.1.1.1'] } }])
  })
})
