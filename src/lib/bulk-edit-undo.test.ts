import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/link-cache', () => ({ invalidateLinks: vi.fn() }))
vi.mock('@/lib/folders', () => ({ visibleUrlWhere: vi.fn() }))
import { planUndo, type CurrentLink } from './bulk-edit-undo'

const ev = (urlId: string, before: object, after: object) => ({ id: 'e' + urlId, urlId, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after) })
const link = (o: Partial<CurrentLink>): CurrentLink => ({ id: 'a', shortCode: 'abc', tags: [], ...o })

describe('planUndo', () => {
  it('restores tags and dates when the link still holds the edited value', () => {
    const exp = new Date('2027-01-01T00:00:00Z')
    const { items, skipped } = planUndo(
      [ev('a', { tags: ['x'], expiresAt: null }, { tags: ['x', 'y'], expiresAt: exp.toISOString() })],
      new Map([['a', link({ tags: ['x', 'y'], expiresAt: exp })]]),
    )
    expect(skipped).toEqual([])
    expect(items[0].data).toEqual({ tags: ['x'], expiresAt: null })
  })
  it('does not clobber fields changed after the bulk edit', () => {
    const { items, skipped } = planUndo(
      [ev('a', { maxClicks: null, isActive: true }, { maxClicks: 5, isActive: false })],
      new Map([['a', link({ maxClicks: 99, isActive: false })]]),
    )
    expect(items[0].data).toEqual({ isActive: true })
    expect(skipped[0].reason).toMatch(/maxClicks/)
  })
  it('skips deleted links and unparseable audit rows', () => {
    const { items, skipped } = planUndo(
      [ev('gone', { tags: [] }, { tags: ['z'] }), { id: 'e2', urlId: 'a', beforeJson: null, afterJson: null }],
      new Map([['a', link({})]]),
    )
    expect(items).toEqual([])
    expect(skipped.map((s) => s.reason)).toEqual(['link no longer exists', 'audit entry has no restorable values'])
  })
})
