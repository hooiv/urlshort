import { describe, expect, it } from 'vitest'
import { buildBulkEditChanges, emptyBulkEditForm } from './bulk-edit-form'

const now = new Date(2026, 9, 12, 12)
describe('buildBulkEditChanges', () => {
  it('errors on an empty form', () => expect(buildBulkEditChanges(emptyBulkEditForm, now)).toEqual({ error: 'Choose at least one change' }))
  it('maps every field', () => {
    const r = buildBulkEditChanges({ ...emptyBulkEditForm, addTags: 'a, b,', removeTags: 'c', folder: 'none', expiry: '2026-12-31', extendDays: '', state: 'archive', password: '', pin: '', redirect: '', utmSource: ' news ', utmMedium: '', utmCampaign: 'q4' }, now)
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
  it('maps pin and redirect type', () => {
    expect(buildBulkEditChanges({ ...emptyBulkEditForm, pin: 'unpin', redirect: '301' })).toEqual({ changes: { pinned: false, redirectStatus: 301 } })
    expect(buildBulkEditChanges({ ...emptyBulkEditForm, redirect: 'default' })).toEqual({ changes: { redirectStatus: null } })
  })
})

describe('destination rewrite form', () => {
  it('builds host, prefix and text rewrites and validates input', async () => {
    const { buildBulkEditChanges: build, emptyBulkEditForm: empty } = await import('./bulk-edit-form')
    expect(build({ ...empty, rewriteMode: 'host', rewriteFrom: ' a.com ', rewriteTo: 'b.com' })).toEqual({ changes: { rewriteDestination: { mode: 'host', from: 'a.com', to: 'b.com' } } })
    expect(build({ ...empty, rewriteMode: 'text', rewriteFrom: 'x', rewriteTo: '' })).toEqual({ changes: { rewriteDestination: { mode: 'text', find: 'x', replace: '' } } })
    expect(build({ ...empty, rewriteMode: 'prefix', rewriteFrom: '/a', rewriteTo: '' })).toEqual({ error: 'Enter the replacement' })
    expect(build({ ...empty, rewriteMode: 'host' })).toEqual({ error: 'Enter the destination text to find' })
  })
})

describe('bulk edit limits', () => {
  it('builds limit, fallback, note and cloak changes', () => {
    const r = buildBulkEditChanges({ ...emptyBulkEditForm, maxClicks: '500', dailyCap: 'clear', expiredUrl: 'https://x.test/over', notes: ' hi ', cloak: 'on' })
    expect(r).toEqual({ changes: { maxClicks: 500, dailyClickCap: null, expiredUrl: 'https://x.test/over', notes: 'hi', cloaked: true } })
  })
  it('rejects bad numbers and urls', () => {
    expect(buildBulkEditChanges({ ...emptyBulkEditForm, maxClicks: '0' })).toHaveProperty('error')
    expect(buildBulkEditChanges({ ...emptyBulkEditForm, dailyCap: '1.5' })).toHaveProperty('error')
    expect(buildBulkEditChanges({ ...emptyBulkEditForm, expiredUrl: 'javascript:alert(1)' })).toHaveProperty('error')
  })
})
