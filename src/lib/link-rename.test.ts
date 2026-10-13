import { describe, expect, it } from 'vitest'
import { validateRename } from './link-rename'

describe('validateRename', () => {
  it('accepts a valid new code', () => expect(validateRename('new-code', 'old')).toEqual({ ok: true, code: 'new-code' }))
  it('requires a string', () => {
    expect(validateRename(undefined, 'old').ok).toBe(false)
    expect(validateRename('', 'old').ok).toBe(false)
    expect(validateRename(5, 'old').ok).toBe(false)
  })
  it('rejects bad characters, short codes and reserved words', () => {
    expect(validateRename('a b', 'old').ok).toBe(false)
    expect(validateRename('ab', 'old').ok).toBe(false)
    expect(validateRename('api', 'old').ok).toBe(false)
  })
  it('rejects the unchanged code and uses newShortCode in messages', () => {
    expect(validateRename('same', 'same')).toMatchObject({ ok: false })
    const bad = validateRename('a b', 'old')
    expect(bad.ok === false && bad.error).toContain('newShortCode')
  })
})
