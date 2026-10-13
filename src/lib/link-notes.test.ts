import { describe, expect, it } from 'vitest'
import { LINK_NOTES_MAX, notesMatch, validateLinkNotes } from './link-notes'

describe('validateLinkNotes', () => {
  it('clears on null, undefined and blank', () => {
    expect(validateLinkNotes(null)).toBeNull()
    expect(validateLinkNotes(undefined)).toBeNull()
    expect(validateLinkNotes('  \n ')).toBeNull()
  })
  it('keeps newlines, normalises CRLF, strips control chars', () => {
    expect(validateLinkNotes('a\r\nb\u0000c\u0007')).toBe('a\nbc')
  })
  it('rejects non-strings and over-long notes', () => {
    expect(() => validateLinkNotes(5)).toThrow('string')
    expect(() => validateLinkNotes('x'.repeat(LINK_NOTES_MAX + 1))).toThrow('at most')
    expect(validateLinkNotes('x'.repeat(LINK_NOTES_MAX))).toHaveLength(LINK_NOTES_MAX)
  })
})
describe('notesMatch', () => {
  it('matches case-insensitively and ignores empties', () => {
    expect(notesMatch('Launch for Q4 PR', 'q4')).toBe(true)
    expect(notesMatch(null, 'q4')).toBe(false)
    expect(notesMatch('x', '  ')).toBe(false)
  })
})
