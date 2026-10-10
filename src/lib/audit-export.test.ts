import { describe, expect, it } from 'vitest'
import { auditToCsv, auditToJson, parseAuditRange, workspaceAuditWhere, type AuditRow } from './audit-export'

const row = (o: Partial<AuditRow> = {}): AuditRow => ({ id: 'e1', createdAt: new Date('2026-10-01T10:00:00Z'), action: 'link.update', actorType: 'user', actorUserId: 'u1', urlId: 'l1', resourceType: 'link', resourceId: 'l1', ipHash: 'secret', userAgent: 'UA', beforeJson: '{"a":1}', afterJson: '{"a":2}', metadataJson: null, ...o })

describe('audit export', () => {
  it('treats a same-day range as one full UTC day and accepts leap days', () => {
    const r = parseAuditRange('2028-02-29', '2028-02-29')
    expect(r.to!.getTime() - r.from!.getTime()).toBe(86_400_000)
    expect(() => parseAuditRange('2027-02-29', null)).toThrow(/real date/)
  })
  it('parses inclusive ranges into an exclusive upper bound', () => {
    const r = parseAuditRange('2026-10-01', '2026-10-02')
    expect(r.from?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(r.to?.toISOString()).toBe('2026-10-03T00:00:00.000Z')
    expect(parseAuditRange(null, null)).toEqual({ from: undefined, to: undefined })
  })
  it('rejects bad, impossible and reversed dates', () => {
    expect(() => parseAuditRange('10/01/2026', null)).toThrow(/YYYY-MM-DD/)
    expect(() => parseAuditRange('2026-02-30', null)).toThrow(/real date/)
    expect(() => parseAuditRange('2026-10-05', '2026-10-01')).toThrow(/after/)
  })
  it('scopes to workspace links or stamped metadata and supports action prefixes', () => {
    const and = (workspaceAuditWhere('ws1', ['l1'], { action: 'link.*', actorUserId: 'u1' }) as { AND: unknown[] }).AND
    expect(JSON.stringify(and[0])).toContain('"urlId":{"in":["l1"]}')
    expect(JSON.stringify(and[0])).toContain('\\"workspaceId\\":\\"ws1\\"')
    expect(and).toContainEqual({ action: { startsWith: 'link.' } })
    expect(and).toContainEqual({ actorUserId: 'u1' })
  })
  it('omits the link clause when the workspace has no links', () => {
    const and = (workspaceAuditWhere('ws1', [], {}) as { AND: unknown[] }).AND
    expect(JSON.stringify(and[0])).not.toContain('urlId')
  })
  it('never exports ip hashes and neutralizes formulas in CSV', () => {
    const csv = auditToCsv([row({ userAgent: '=HYPERLINK("x")' })])
    expect(csv).not.toContain('secret')
    expect(csv).toContain("'=HYPERLINK")
    expect(csv.split('\n')[0]).toContain('"time","action"')
  })
  it('parses stored JSON and tolerates corrupt values', () => {
    const [a] = auditToJson([row({ beforeJson: '{bad' })])
    expect(a.before).toBe('{bad')
    expect(a.after).toEqual({ a: 2 })
    expect(a).not.toHaveProperty('ipHash')
  })

  it('applies actor, open-ended range and case-insensitive search filters', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    const where = workspaceAuditWhere('w1', [], { actorUserId: 'u1', from, search: 'Delete' })
    const and = (where as { AND: unknown[] }).AND
    expect(and).toContainEqual({ actorUserId: 'u1' })
    expect(and).toContainEqual({ createdAt: { gte: from } })
    const search = and.find((c) => JSON.stringify(c).includes('insensitive')) as { OR: unknown[] }
    expect(search.OR).toHaveLength(4)
  })
})
