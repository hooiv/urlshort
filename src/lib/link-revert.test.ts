import { describe, expect, it } from 'vitest'
import { planRevert } from './link-revert'

const cur = { title: 'New', isActive: false, shortCode: 'abc' }
const ev = (action: string, before: object | null, after: object | null) => ({
  action,
  beforeJson: before ? JSON.stringify(before) : null,
  afterJson: after ? JSON.stringify(after) : null,
})

describe('planRevert', () => {
  it('restores title and isActive', () => {
    const r = planRevert(ev('link.update', { title: 'Old', isActive: true }, { title: 'New', isActive: false }), cur)
    expect(r).toEqual({ ok: true, data: { title: 'Old', isActive: true }, fields: ['title', 'isActive'] })
  })
  it('skips unchanged fields', () => {
    const r = planRevert(ev('link.update', { title: 'New', isActive: true }, { title: 'New', isActive: false }), cur)
    expect(r).toMatchObject({ ok: true, fields: ['isActive'] })
  })
  it('allows restoring a null title', () => {
    const r = planRevert(ev('link.update', { title: null, isActive: false }, { title: 'New', isActive: false }), cur)
    expect(r).toMatchObject({ ok: true, data: { title: null } })
  })
  it('refuses when a newer edit exists', () => {
    const r = planRevert(ev('link.update', { title: 'Old', isActive: false }, { title: 'Mid', isActive: false }), cur)
    expect(r).toMatchObject({ ok: false, status: 409 })
  })
  it('reverts a rename', () => {
    const r = planRevert(ev('link.rename', { shortCode: 'old' }, { shortCode: 'abc' }), cur)
    expect(r).toMatchObject({ ok: true, data: { shortCode: 'old' } })
  })
  it('rejects unsupported actions and missing snapshots', () => {
    expect(planRevert(ev('link.trash', null, { shortCode: 'abc' }), cur)).toMatchObject({ ok: false, status: 422 })
    expect(planRevert(ev('link.update', null, { title: 'x' }), cur)).toMatchObject({ ok: false, status: 422 })
  })
  it('handles corrupt JSON', () => {
    expect(planRevert({ action: 'link.update', beforeJson: '{oops', afterJson: null }, cur)).toMatchObject({ ok: false, status: 422 })
  })
})
