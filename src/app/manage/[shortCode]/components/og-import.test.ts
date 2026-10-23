import { describe, expect, it } from 'vitest'
import { mergeUnfurledOg } from './og-import'

const empty = { title: '', description: '', image: '' }

describe('mergeUnfurledOg', () => {
  it('fills empty fields and collapses whitespace', () => {
    expect(mergeUnfurledOg(empty, { title: '  Hi\n there ', description: 'd', image: 'https://x.co/a.png' })).toEqual({
      title: 'Hi there', description: 'd', image: 'https://x.co/a.png',
    })
  })
  it('keeps user text unless overwrite', () => {
    const cur = { title: 'Mine', description: '', image: '' }
    expect(mergeUnfurledOg(cur, { title: 'Theirs', description: 'D' }).title).toBe('Mine')
    expect(mergeUnfurledOg(cur, { title: 'Theirs' }, true).title).toBe('Theirs')
  })
  it('rejects non-http images and clamps length', () => {
    expect(mergeUnfurledOg(empty, { image: 'javascript:alert(1)' }).image).toBe('')
    expect(mergeUnfurledOg(empty, { title: 'a'.repeat(500) }).title).toHaveLength(120)
  })
  it('ignores null fields', () => {
    expect(mergeUnfurledOg({ title: 'k', description: 'k', image: 'k' }, { title: null, description: null, image: null }, true)).toEqual({ title: 'k', description: 'k', image: 'k' })
  })
})
