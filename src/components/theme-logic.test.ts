import { describe, expect, it } from 'vitest'
import {
  parseStoredTheme,
  readPrefersDarkSafe,
  readStoredThemeSafe,
  resolveInitialTheme,
  themeToStorage,
} from './theme-logic'

describe('parseStoredTheme', () => {
  it('accepts only dark/light', () => {
    expect(parseStoredTheme('dark')).toBe('dark')
    expect(parseStoredTheme('light')).toBe('light')
    expect(parseStoredTheme(null)).toBeNull()
    expect(parseStoredTheme('DARK')).toBeNull()
    expect(parseStoredTheme('')).toBeNull()
  })
})

describe('resolveInitialTheme', () => {
  it('prefers stored value over media query', () => {
    expect(resolveInitialTheme('dark', false)).toBe(true)
    expect(resolveInitialTheme('light', true)).toBe(false)
    expect(resolveInitialTheme(null, true)).toBe(true)
    expect(resolveInitialTheme(null, false)).toBe(false)
  })
})

describe('safe readers', () => {
  it('survives throwing storage/media implementations', () => {
    expect(
      readStoredThemeSafe(() => {
        throw new Error('blocked')
      }),
    ).toBeNull()
    expect(readStoredThemeSafe(() => 'dark')).toBe('dark')
    expect(
      readPrefersDarkSafe(() => {
        throw new Error('unsupported')
      }),
    ).toBe(false)
    expect(readPrefersDarkSafe(() => true)).toBe(true)
  })
})

describe('themeToStorage', () => {
  it('round-trips the toggle', () => {
    expect(themeToStorage(true)).toBe('dark')
    expect(themeToStorage(false)).toBe('light')
  })
})
