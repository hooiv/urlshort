import { describe, expect, it } from 'vitest'
import { bioCreateSchema, normalizeBioHandle, validateBioHandle } from './route'

describe('normalizeBioHandle', () => {
  it('trims and lowercases', () => {
    expect(normalizeBioHandle('  Ada-Lovelace ')).toBe('ada-lovelace')
  })

  it('returns empty for non-strings', () => {
    expect(normalizeBioHandle(null)).toBe('')
    expect(normalizeBioHandle(42)).toBe('')
  })
})

describe('validateBioHandle', () => {
  it('accepts a valid handle', () => {
    expect(validateBioHandle('ada-lovelace-99')).toBeNull()
  })

  it('rejects empty, oversized, and illegal handles', () => {
    expect(validateBioHandle('')).toBe('Handle is required')
    expect(validateBioHandle('a'.repeat(65))).toMatch(/64 characters or fewer/)
    expect(validateBioHandle('Bad Handle!')).toMatch(/only contain/)
    expect(validateBioHandle('-leading')).toMatch(/only contain/)
    expect(validateBioHandle('trailing-')).toMatch(/only contain/)
  })
})

describe('bioCreateSchema', () => {
  it('accepts a minimal valid profile', () => {
    expect(bioCreateSchema.safeParse({ handle: 'ada-99' }).success).toBe(true)
  })

  it('rejects bad handles and oversized text', () => {
    expect(bioCreateSchema.safeParse({ handle: 'Bad Handle!' }).success).toBe(false)
    expect(bioCreateSchema.safeParse({ handle: 'ok-handle', bioText: 'x'.repeat(501) }).success).toBe(false)
  })
})
