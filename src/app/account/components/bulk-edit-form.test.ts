import { describe, expect, it } from 'vitest'
import { buildBulkEditChanges, emptyBulkEditForm } from './bulk-edit-form'

const now = new Date(2026, 9, 12, 12)
describe('buildBulkEditChanges', () => {
  it('errors on an empty form', () => expect(buildBulkEditChanges(emptyBulkEditForm, now)).toEqual({ error: 'Choose at least one change' }))
  it('maps every field', () => {
    const r = buildBulkEditChanges({ addTags: 'a, b,', removeTags: 'c', folder: 'none', expiry: '2026-12-31', extendDays: '', state: 'archive', password: '', utmSource: ' news ', utmMedium: '', utmCampaign: 'q4' }, now)
    expect(r).toMatchObject({ changes: { addTags: ['a', 'b'], removeTags: ['c'], folderId: null, archived: true, utm: { source: 'news', campaign: 'q4' } } })
    expect((r as { changes: { expiresAt: string } }).changes.expiresAt).toMatch(/^2026-12-31T|^2027-01-01T/)
  })
  it('maps password set, remove and short', () => {
    expect(buildBulkEditChanges({ ...emptyBulkEditForm, password: 'abcd1' }, now)).toEqual({ changes: { password: 'abcd1' } })
    expect(buildBulkEditChanges({ ...emptyBulkEditForm, password: 'remove' }, now)).toEqual({ changes: { password: null } })
    expect('error' in buildBulkEditChanges({ ...emptyBulkEditForm, password: 'abc' }, now)).toBe(true)
  })
  it('builds extendExpiryDays and rejects bad or conflicting input', () => {
    expect(buildBulkEditChanges({ ...emptyBulkEditForm, extendDays: '30' }, now)).toEqual({ changes: { extendExpiryDays: 30 } })
    expect('error' in buildBulkEditChanges({ ...emptyBulkEditForm, extendDays: '0' }, now)).toBe(true)
    expect('error' in buildBulkEditChanges({ ...emptyBulkEditForm, extendDays: '2.5' }, now)).toBe(true)
    expect('error' in buildBulkEditChanges({ ...emptyBulkEditForm, extendDays: '5', expiry: 'clear' }, now)).toBe(true)
  })
  it('clears expiry and rejects the past', () => {
    expect(buildBulkEditChanges({ ...emptyBulkEditForm, expiry: 'clear' }, now)).toEqual({ changes: { expiresAt: null } })
    expect(buildBulkEditChanges({ ...emptyBulkEditForm, expiry: '2026-01-01' }, now)).toEqual({ error: 'Expiry must be in the future' })
  })
  it('restores', () => expect(buildBulkEditChanges({ ...emptyBulkEditForm, state: 'restore' }, now)).toEqual({ changes: { archived: false } }))
})

describe('trash state', () => {
  it('sends trash alone', () => {
    expect(buildBulkEditChanges({ ...emptyBulkEditForm, state: 'trash' })).toEqual({ changes: { trash: true } })
  })
  it('refuses trash combined with other changes', () => {
    expect(buildBulkEditChanges({ ...emptyBulkEditForm, state: 'trash', addTags: 'x' })).toEqual({ error: 'Moving to trash cannot be combined with other changes' })
  })
})
