import { describe, expect, it } from 'vitest'
import { linksToCsv, parseExportFormat, toExportedLink } from './links-export'

const row = { shortCode: 'abc', originalUrl: 'https://e.com/?a=1,2', title: '=HYPERLINK("x")', tags: ['q1', '-sum'], folderId: null, clicks: 3, isActive: true, passwordHash: 'h', createdAt: new Date('2026-01-01T00:00:00Z'), startsAt: null, expiresAt: new Date('2026-02-01T00:00:00Z') }

describe('links export', () => {
  it('parses formats', () => {
    expect(parseExportFormat(null)).toBe('csv')
    expect(parseExportFormat('json')).toBe('json')
    expect(parseExportFormat('xml')).toBeNull()
  })
  it('never leaks the password hash', () => {
    const l = toExportedLink(row)
    expect(l.passwordProtected).toBe(true)
    expect(JSON.stringify(l)).not.toContain('"h"')
  })
  it('neutralises formulas and quotes commas in CSV', () => {
    const csv = linksToCsv([toExportedLink(row)])
    const lines = csv.split('\n')
    expect(lines[0]).toContain('"shortCode"')
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`)
    expect(lines[1]).toContain('"q1;\'-sum"')
    expect(lines[1]).toContain('"https://e.com/?a=1,2"')
  })
})
