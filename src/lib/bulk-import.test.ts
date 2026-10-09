import { describe, expect, it } from 'vitest'
import { aliasFromShortLink, detectColumns, mapWithConcurrency, parseImport, validateImportUrl } from './bulk-import'

describe('detectColumns', () => {
  it('recognises the platforms people migrate from', () => {
    const source = (header: string[]) => {
      const result = detectColumns(header)
      return 'error' in result ? result.error : result.source
    }
    expect(source(['originalUrl', 'title', 'customAlias', 'tags'])).toBe('quicklink')
    expect(source(['Bitlink', 'Long URL', 'Title'])).toBe('bitly')
    expect(source(['Slashtag', 'Destination', 'Title'])).toBe('rebrandly')
    expect(source(['Original URL', 'Short URL', 'Title'])).toBe('shortio')
    expect(source(['\ufeffLong_URL'])).toBe('generic')
    expect(source(['title'])).toMatch(/Missing a destination column/)
  })
})

describe('aliasFromShortLink', () => {
  it('takes the last path segment of exported short links', () => {
    expect(aliasFromShortLink('https://bit.ly/abc123')).toBe('abc123')
    expect(aliasFromShortLink('rebrand.ly/promo-2026/')).toBe('promo-2026')
    expect(aliasFromShortLink('https://bit.ly/')).toBeNull()
    expect(aliasFromShortLink('')).toBeNull()
  })
})

describe('validateImportUrl', () => {
  it('normalises bare hosts and rejects unsafe schemes and credentials', () => {
    expect(validateImportUrl('example.com/a')).toEqual({ url: 'https://example.com/a', error: null })
    expect(validateImportUrl('javascript:alert(1)').error).toBeTruthy()
    expect(validateImportUrl('https://user:pw@example.com').error).toMatch(/credentials/)
    expect(validateImportUrl('').error).toBe('Missing destination URL')
    expect(validateImportUrl('https://localhost').error).toBe('Invalid URL')
  })
})

describe('parseImport', () => {
  it('handles quoted commas, empty cells, blank lines and CRLF', () => {
    const parsed = parseImport('originalUrl,title,customAlias\r\n"https://example.com/a?x=1,2",,\r\n\r\nhttps://example.com/b,"Hello, world",my-link\r\n')
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.rows).toEqual([
      { row: 2, url: 'https://example.com/a?x=1,2', rawUrl: 'https://example.com/a?x=1,2', alias: null, title: null, tags: [], error: null },
      { row: 3, url: 'https://example.com/b', rawUrl: 'https://example.com/b', alias: 'my-link', title: 'Hello, world', tags: [], error: null },
    ])
  })

  it('flags reserved, malformed and duplicate aliases per row', () => {
    const parsed = parseImport('originalUrl,customAlias\nhttps://a.com,api\nhttps://b.com,x\nhttps://c.com,Promo\nhttps://d.com,promo')
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.rows.map((row) => row.error)).toEqual(['Alias is reserved', expect.stringMatching(/3–64/), null, 'Alias already used on row 4'])
  })

  it('enforces size limits up front', () => {
    expect(parseImport('')).toEqual({ error: 'CSV is empty' })
    expect(parseImport('originalUrl')).toEqual({ error: 'CSV must contain a header and at least one row' })
    const tooMany = 'originalUrl\n' + Array.from({ length: 2001 }, (_, i) => `https://e.com/${i}`).join('\n')
    expect(parseImport(tooMany)).toEqual({ error: 'Max 2000 links per import' })
  })
})

describe('mapWithConcurrency', () => {
  it('bounds parallelism and preserves order', async () => {
    let active = 0
    let peak = 0
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active++; peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 1))
      active--
      return n * 2
    })
    expect(out).toEqual([2, 4, 6, 8, 10, 12])
    expect(peak).toBe(2)
  })
})
