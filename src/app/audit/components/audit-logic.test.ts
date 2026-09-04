import { describe, expect, it } from 'vitest'
import {
  buildAuditQuery,
  formatAuditDate,
  formatAuditSubtitle,
  getAuditErrorMessage,
  parseAuditResponse,
} from './audit-logic'

describe('buildAuditQuery', () => {
  it('returns empty for blank search', () => {
    expect(buildAuditQuery('   ')).toBe('')
  })

  it('encodes the trimmed query', () => {
    expect(buildAuditQuery('  link.update  ')).toBe('?search=link.update')
    expect(buildAuditQuery('a&b=c')).toBe(`?search=${encodeURIComponent('a&b=c')}`)
  })

  it('caps the query at 200 chars like the API', () => {
    expect(buildAuditQuery('x'.repeat(500))).toHaveLength('?search='.length + 200)
  })
})

describe('parseAuditResponse', () => {
  const event = {
    id: '1',
    action: 'link.update',
    actorType: 'owner',
    resourceType: 'url',
    resourceId: 'abc',
    createdAt: '2026-01-01T00:00:00.000Z',
    metadataJson: null,
  }

  it('parses the current { items } envelope', () => {
    expect(parseAuditResponse({ items: [event], nextCursor: null })).toEqual([event])
  })

  it('still accepts a legacy bare array', () => {
    expect(parseAuditResponse([event])).toEqual([event])
  })

  it('drops malformed entries instead of crashing the list', () => {
    expect(parseAuditResponse({ items: [event, null, { id: 'x' }] })).toEqual([event])
    expect(parseAuditResponse(null)).toEqual([])
    expect(parseAuditResponse({})).toEqual([])
  })
})

describe('formatAuditDate', () => {
  it('formats valid ISO dates and guards invalid ones', () => {
    expect(formatAuditDate('not-a-date')).toBe('Unknown date')
    expect(formatAuditDate('')).toBe('Unknown date')
    expect(formatAuditDate('2026-01-01T00:00:00.000Z')).not.toBe('Unknown date')
  })
})

describe('formatAuditSubtitle / getAuditErrorMessage', () => {
  it('falls back to account when resourceType is null', () => {
    expect(
      formatAuditSubtitle({ resourceType: null, resourceId: null, actorType: 'owner' }),
    ).toBe('account · owner')
    expect(
      formatAuditSubtitle({ resourceType: 'url', resourceId: 'abc', actorType: 'owner' }),
    ).toBe('url · abc · owner')
  })

  it('prefers the server error string', () => {
    expect(getAuditErrorMessage({ error: 'Authentication required' }, 'Load failed')).toBe(
      'Authentication required',
    )
    expect(getAuditErrorMessage(null, 'Load failed')).toBe('Load failed')
  })
})
