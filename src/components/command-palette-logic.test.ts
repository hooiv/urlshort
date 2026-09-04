import { describe, expect, it } from 'vitest'
import {
  clampActiveIndex,
  filterActions,
  getNextActiveIndex,
  isDismissKey,
  isPaletteToggleShortcut,
  shouldSearchLinks,
} from './command-palette-logic'

describe('isPaletteToggleShortcut', () => {
  it('matches cmd+k and ctrl+k only', () => {
    expect(isPaletteToggleShortcut('k', true, false)).toBe(true)
    expect(isPaletteToggleShortcut('k', false, true)).toBe(true)
    expect(isPaletteToggleShortcut('k', false, false)).toBe(false)
    expect(isPaletteToggleShortcut('K', true, false)).toBe(false)
    expect(isPaletteToggleShortcut('j', true, false)).toBe(false)
  })
})

describe('isDismissKey', () => {
  it('matches Escape only', () => {
    expect(isDismissKey('Escape')).toBe(true)
    expect(isDismissKey('Esc')).toBe(false)
    expect(isDismissKey('Enter')).toBe(false)
  })
})

describe('shouldSearchLinks', () => {
  it('requires 2+ non-space chars', () => {
    expect(shouldSearchLinks('')).toBe(false)
    expect(shouldSearchLinks(' a ')).toBe(false)
    expect(shouldSearchLinks('ab')).toBe(true)
    expect(shouldSearchLinks('  abc  ')).toBe(true)
  })
})

describe('filterActions', () => {
  const actions = [{ name: 'Dashboard / Creator' }, { name: 'Workspaces' }, { name: 'Bio Pages' }]
  it('is case-insensitive and returns all on empty query', () => {
    expect(filterActions(actions, '')).toHaveLength(3)
    expect(filterActions(actions, 'bio')).toEqual([{ name: 'Bio Pages' }])
    expect(filterActions(actions, 'WORK')).toEqual([{ name: 'Workspaces' }])
    expect(filterActions(actions, 'zzz')).toEqual([])
  })
})

describe('getNextActiveIndex', () => {
  it('wraps around and handles empty lists', () => {
    expect(getNextActiveIndex(-1, 0, 1)).toBe(-1)
    expect(getNextActiveIndex(-1, 3, 1)).toBe(0)
    expect(getNextActiveIndex(-1, 3, -1)).toBe(2)
    expect(getNextActiveIndex(2, 3, 1)).toBe(0)
    expect(getNextActiveIndex(0, 3, -1)).toBe(2)
    expect(getNextActiveIndex(1, 3, 1)).toBe(2)
  })
})

describe('clampActiveIndex', () => {
  it('clamps stale selection after result shrinkage', () => {
    expect(clampActiveIndex(-1, 3)).toBe(-1)
    expect(clampActiveIndex(5, 3)).toBe(2)
    expect(clampActiveIndex(1, 0)).toBe(-1)
  })
})
