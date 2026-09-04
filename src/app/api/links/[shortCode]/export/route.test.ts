import { describe, expect, it } from 'vitest'
import { csvEscape } from './route'

describe('csvEscape', () => {
  it('quotes fields with commas and quotes', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
  })

  it('prefixes spreadsheet formulas', () => {
    expect(csvEscape('=cmd|calc')).toBe("'=cmd|calc")
    expect(csvEscape('+1+1')).toBe("'+1+1")
    expect(csvEscape('-2')).toBe("'-2")
    expect(csvEscape('@evil')).toBe("'@evil")
  })

  it('leaves plain values untouched', () => {
    expect(csvEscape('US')).toBe('US')
    expect(csvEscape(null)).toBe('')
  })
})
