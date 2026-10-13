import { describe, expect, it } from 'vitest'
import { purgeDate, toTrashedLink, TRASH_RETENTION_DAYS } from './link-trash'

describe('link trash', () => {
  const deletedAt = new Date('2026-10-01T00:00:00Z')
  it('purges exactly after the retention window', () => {
    expect(purgeDate(deletedAt).toISOString()).toBe('2026-10-31T00:00:00.000Z')
    expect(TRASH_RETENTION_DAYS).toBe(30)
  })
  it('reports days left, rounding up and never going negative', () => {
    const row = { id: 'a', shortCode: 'x', originalUrl: 'https://e.com', clicks: 3, deletedAt }
    expect(toTrashedLink(row, new Date('2026-10-01T12:00:00Z')).daysLeft).toBe(30)
    expect(toTrashedLink(row, new Date('2026-10-30T12:00:00Z')).daysLeft).toBe(1)
    expect(toTrashedLink(row, new Date('2026-12-01T00:00:00Z')).daysLeft).toBe(0)
  })
})
