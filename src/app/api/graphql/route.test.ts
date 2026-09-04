import { describe, expect, it } from 'vitest'
import { validatePersistQueryInput } from './route'

describe('validatePersistQueryInput', () => {
  it('accepts a minimal safe query', () => {
    expect(validatePersistQueryInput('{ me }')).toBe('{ me }')
  })

  it('rejects empty or non-string input', () => {
    expect(() => validatePersistQueryInput('')).toThrow()
    expect(() => validatePersistQueryInput('   ')).toThrow()
    expect(() => validatePersistQueryInput(null)).toThrow()
  })

  it('rejects oversized queries', () => {
    expect(() => validatePersistQueryInput('x'.repeat(20_001))).toThrow('too large')
  })

  it('rejects queries that violate depth limits', () => {
    const deep = '{ a { b { c { d { e { f { g { h { i } } } } } } } } }'
    expect(() => validatePersistQueryInput(deep)).toThrow()
  })
})
