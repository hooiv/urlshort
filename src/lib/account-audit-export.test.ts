import { describe, it, expect } from 'vitest'
import { csvCell, auditRowsToCsv, auditRowsToNdjson, parseDateBound } from './account-audit-export'

const row = {
  id: 'a1', action: 'link.create', actorType: 'user', resourceType: 'url', resourceId: 'x',
  urlId: null, metadataJson: '{"a":"b,c"}', createdAt: new Date('2026-01-02T03:04:05Z'),
}
describe('audit export', () => {
  it('quotes and neutralises formulas', () => {
    expect(csvCell('a"b')).toBe('"a""b"')
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell(null)).toBe('')
  })
  it('builds csv with header', () => {
    const csv = auditRowsToCsv([row])
    expect(csv.split('\r\n')[0]).toBe('id,createdAt,action,actorType,resourceType,resourceId,urlId,metadata')
    expect(csv).toContain('2026-01-02T03:04:05.000Z,link.create')
    expect(csv).toContain('"{""a"":""b,c""}"')
  })
  it('builds ndjson', () => {
    expect(auditRowsToNdjson([])).toBe('')
    expect(JSON.parse(auditRowsToNdjson([row]).trim()).createdAt).toBe('2026-01-02T03:04:05.000Z')
  })
  it('parses bounds', () => {
    expect(parseDateBound('2026-01-02', true)?.toISOString()).toBe('2026-01-02T23:59:59.999Z')
    expect(parseDateBound('nope', false)).toBeNull()
    expect(parseDateBound(null, false)).toBeNull()
  })
})
