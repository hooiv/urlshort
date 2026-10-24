import { describe, expect, it } from 'vitest'
import { BIO_THEMES, getTheme } from './bio-themes'

describe('bio themes', () => {
  it('keys match ids and all fields are populated', () => {
    for (const [key, t] of Object.entries(BIO_THEMES)) {
      expect(t.id).toBe(key)
      for (const [field, value] of Object.entries(t)) expect(value, `${key}.${field}`).toBeTruthy()
      expect(t.accent).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
  it('falls back to midnight for unknown, empty or null ids', () => {
    expect(getTheme('nope').id).toBe('midnight')
    expect(getTheme('').id).toBe('midnight')
    expect(getTheme(null).id).toBe('midnight')
    expect(getTheme(undefined).id).toBe('midnight')
  })
  it('does not resolve inherited object keys', () => {
    expect(getTheme('constructor').id).toBe('midnight')
  })
})
