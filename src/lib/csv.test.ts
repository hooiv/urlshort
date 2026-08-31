import { describe, expect, it } from 'vitest'
import { parseCsv, serializeCsv } from './csv'

describe('CSV Parser and Serializer', () => {
  it('parses standard unquoted CSV rows', () => {
    const csv = `originalUrl,title,customAlias\nhttps://example.com,Example Home,home\nhttps://google.com,Google Search,google`
    const parsed = parseCsv(csv)
    expect(parsed.length).toBe(3)
    expect(parsed[0]).toEqual(['originalUrl', 'title', 'customAlias'])
    expect(parsed[1]).toEqual(['https://example.com', 'Example Home', 'home'])
    expect(parsed[2]).toEqual(['https://google.com', 'Google Search', 'google'])
  })

  it('correctly handles quoted fields containing commas and whitespace', () => {
    const csv = `originalUrl,title,tags\nhttps://example.com/item,"Summer Sale, Special Edition","promo, summer, 2026"`
    const parsed = parseCsv(csv)
    expect(parsed.length).toBe(2)
    expect(parsed[1][0]).toBe('https://example.com/item')
    expect(parsed[1][1]).toBe('Summer Sale, Special Edition')
    expect(parsed[1][2]).toBe('promo, summer, 2026')
  })

  it('handles escaped double quotes in CSV fields', () => {
    const csv = `originalUrl,title\nhttps://example.com,"Say ""Hello"" to World"`
    const parsed = parseCsv(csv)
    expect(parsed.length).toBe(2)
    expect(parsed[1][1]).toBe('Say "Hello" to World')
  })

  it('serializes rows into valid RFC 4180 CSV strings', () => {
    const data = [
      ['URL', 'Title', 'Tags'],
      ['https://example.com', 'Acme & Co, Inc.', 'tag1, tag2'],
    ]
    const serialized = serializeCsv(data)
    expect(serialized).toBe('"URL","Title","Tags"\n"https://example.com","Acme & Co, Inc.","tag1, tag2"')
  })
})
