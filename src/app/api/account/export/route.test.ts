import { describe, expect, it } from 'vitest'
import { redactWebhookUrl, toCsvCell } from './route'

describe('redactWebhookUrl', () => {
  it('reduces https urls to origin', () => {
    expect(redactWebhookUrl('https://hooks.example.com/a/b?x=1')).toBe('https://hooks.example.com/…')
  })

  it('never throws on malformed input', () => {
    expect(redactWebhookUrl('not a url')).toBe('[invalid url]')
    expect(redactWebhookUrl('')).toBe('[invalid url]')
  })
})

describe('toCsvCell', () => {
  it('quotes and escapes embedded quotes', () => {
    expect(toCsvCell('a"b')).toBe('"a""b"')
    expect(toCsvCell('plain')).toBe('"plain"')
  })

  it('neutralizes spreadsheet formula triggers', () => {
    for (const v of ['=1+1', '+cmd', '-2', '@user']) {
      const cell = toCsvCell(v)
      expect(cell.startsWith(`"'${v[0]}`)).toBe(true)
    }
    expect(toCsvCell('https://example.com')).toBe('"https://example.com"')
  })
})
