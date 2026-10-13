import { describe, expect, it } from 'vitest'
import { languageName, parseLanguageWindow, primaryLanguage, shapeLanguageStats } from './language-performance'

describe('parseLanguageWindow', () => {
  it('defaults and validates', () => {
    expect(parseLanguageWindow(null)).toBe(30)
    expect(parseLanguageWindow('7')).toBe(7)
    expect(parseLanguageWindow('14')).toBeNull()
    expect(parseLanguageWindow('1e1')).toBeNull()
  })
})

describe('primaryLanguage', () => {
  it('extracts the primary subtag from Accept-Language style values', () => {
    expect(primaryLanguage('en-GB')).toBe('en')
    expect(primaryLanguage('PT_br,en;q=0.8')).toBe('pt')
    expect(primaryLanguage('fil')).toBe('fil')
    expect(primaryLanguage('*')).toBeNull()
    expect(primaryLanguage('')).toBeNull()
    expect(primaryLanguage(null)).toBeNull()
    expect(primaryLanguage('<script>')).toBeNull()
  })
})

describe('languageName', () => {
  it('resolves names with an Unknown fallback', () => {
    expect(languageName('de')).toBe('German')
    expect(languageName(null)).toBe('Unknown')
  })
})

describe('shapeLanguageStats', () => {
  it('merges variants, computes change and share, caps visitors at clicks', () => {
    const out = shapeLanguageStats([
      { language: 'en', clicks: 60n, visitors: 30n, previous: 40n },
      { language: 'en-US', clicks: 20, visitors: 100, previous: 0 },
      { language: null, clicks: 10, visitors: 2, previous: 0 },
      { language: '*', clicks: 10, visitors: 1, previous: 0 },
      { language: 'fr', clicks: 0, visitors: 0, previous: 0 },
    ])
    expect(out.map((l) => l.name)).toEqual(['English', 'Unknown'])
    expect(out[0]).toMatchObject({ clicks: 80, visitors: 80, changePct: 100, sharePct: 80 })
    expect(out[1]).toMatchObject({ language: null, clicks: 20, changePct: null })
  })
  it('keeps languages that only had previous traffic', () => {
    expect(shapeLanguageStats([{ language: 'es', clicks: 0, visitors: 0, previous: 5 }])[0]).toMatchObject({ clicks: 0, changePct: -100 })
  })
})
