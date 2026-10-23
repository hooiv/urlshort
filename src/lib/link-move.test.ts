import { describe, expect, it } from 'vitest'
import { canMoveBetween, validateMove } from './link-move'

describe('validateMove', () => {
  it('accepts a new workspace with confirm', () => expect(validateMove({ workspaceId: 'w2', confirm: true }, 'w1')).toEqual({ ok: true, workspaceId: 'w2' }))
  it('accepts null (personal) with confirm', () => expect(validateMove({ workspaceId: null, confirm: true }, 'w1')).toEqual({ ok: true, workspaceId: null }))
  it('rejects bad ids, same workspace and missing confirm', () => {
    expect(validateMove({ workspaceId: 5, confirm: true }, 'w1').ok).toBe(false)
    expect(validateMove({ workspaceId: '', confirm: true }, 'w1').ok).toBe(false)
    expect(validateMove({ workspaceId: 'w1', confirm: true }, 'w1').ok).toBe(false)
    expect(validateMove({ workspaceId: null, confirm: true }, null).ok).toBe(false)
    expect(validateMove({ workspaceId: 'w2' }, 'w1').ok).toBe(false)
  })
})

describe('canMoveBetween', () => {
  it('needs edit role on the target', () => {
    expect(canMoveBetween('editor', 'viewer', false)).toMatch(/target/)
    expect(canMoveBetween('editor', null, false)).toMatch(/target/)
    expect(canMoveBetween('editor', 'admin', false)).toBeNull()
  })
  it('needs edit role on the source unless creator', () => {
    expect(canMoveBetween('viewer', 'owner', false)).toMatch(/current/)
    expect(canMoveBetween('creator', 'owner', false)).toBeNull()
  })
  it('personal target needs no membership', () => expect(canMoveBetween('creator', null, true)).toBeNull())
})
