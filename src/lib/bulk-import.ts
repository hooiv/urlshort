import { parseCsv } from './csv'
import { generateShortCode, isReservedCode, normalizeUrl } from './utils'

/**
 * Bulk link import shared by the API and the UI preview.
 *
 * Accepts QuickLink's own template and the CSV exports of the platforms people
 * migrate from (Bitly, Rebrandly, Short.io, Dub, TinyURL): header names are
 * matched against aliases, and a short-link column ("Bitlink", "Short URL")
 * yields the alias so migrated links keep their back-halves.
 */

export const MAX_IMPORT_ROWS = 2000
export const MAX_IMPORT_BYTES = 2_000_000
export const MAX_IMPORT_URL_LENGTH = 2048
const ALIAS = /^[A-Za-z0-9_-]{3,64}$/

export type ImportSource = 'quicklink' | 'bitly' | 'rebrandly' | 'shortio' | 'dub' | 'generic'

const normalizeHeader = (cell: string) => cell.trim().toLowerCase().replace(/^\ufeff/, '').replace(/[\s_-]+/g, ' ')

const URL_HEADERS = ['originalurl', 'original url', 'long url', 'longurl', 'destination', 'destination url', 'url', 'target', 'target url', 'redirect url']
const ALIAS_HEADERS = ['customalias', 'custom alias', 'alias', 'slug', 'key', 'short code', 'shortcode', 'back half', 'path', 'slashtag']
const SHORT_LINK_HEADERS = ['bitlink', 'short url', 'shorturl', 'short link', 'shortlink', 'short link url', 'shorturl secure']
const TITLE_HEADERS = ['title', 'name', 'link title']
const TAG_HEADERS = ['tags', 'tag', 'labels']

export type ColumnMap = { url: number; alias: number; shortLink: number; title: number; tags: number }

function findColumn(header: string[], names: string[]): number {
  for (const name of names) {
    const index = header.indexOf(name)
    if (index !== -1) return index
  }
  return -1
}

export function detectColumns(rawHeader: string[]): { columns: ColumnMap; source: ImportSource } | { error: string } {
  const header = rawHeader.map(normalizeHeader)
  const columns: ColumnMap = {
    url: findColumn(header, URL_HEADERS),
    alias: findColumn(header, ALIAS_HEADERS),
    shortLink: findColumn(header, SHORT_LINK_HEADERS),
    title: findColumn(header, TITLE_HEADERS),
    tags: findColumn(header, TAG_HEADERS),
  }
  if (columns.url === -1) return { error: 'Missing a destination column (originalUrl, Long URL, or Destination)' }
  let source: ImportSource = 'generic'
  if (header.includes('originalurl') || header.includes('customalias')) source = 'quicklink'
  else if (header.includes('bitlink')) source = 'bitly'
  else if (header.includes('slashtag')) source = 'rebrandly'
  else if (header.includes('shorturl secure') || (header.includes('original url') && header.includes('short url'))) source = 'shortio'
  else if (header.includes('key') && header.includes('url')) source = 'dub'
  return { columns, source }
}

/** Last path segment of an exported short link (bit.ly/abc → abc). */
export function aliasFromShortLink(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    const segment = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '')
    return segment || null
  } catch {
    return null
  }
}

export function parseImportTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[;|,]/)
        .map((tag) => tag.trim().toLowerCase().slice(0, 32))
        .filter((tag) => /^[a-z0-9][a-z0-9-_ ]{0,31}$/.test(tag)),
    ),
  ].slice(0, 10)
}

export type ImportRow = {
  /** 1-based line number in the file, header = 1, so users can find the row. */
  row: number
  url: string | null
  /** The destination cell as written, for previews of invalid rows. */
  rawUrl: string
  alias: string | null
  title: string | null
  tags: string[]
  error: string | null
}

export type ParsedImport = { source: ImportSource; rows: ImportRow[]; totalRows: number } | { error: string }

const stripControl = (value: string) => value.replace(/[\u0000-\u001F\u007F]/g, '').trim()

export function validateImportUrl(raw: string): { url: string | null; error: string | null } {
  const cleaned = stripControl(raw)
  if (!cleaned) return { url: null, error: 'Missing destination URL' }
  if (cleaned.length > MAX_IMPORT_URL_LENGTH) return { url: null, error: `URL longer than ${MAX_IMPORT_URL_LENGTH} characters` }
  const url = normalizeUrl(cleaned)
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { url: null, error: 'Only http(s) URLs are supported' }
    if (parsed.username || parsed.password) return { url: null, error: 'URLs with embedded credentials are not allowed' }
    if (!parsed.hostname.includes('.')) return { url: null, error: 'Invalid URL' }
    return { url: parsed.toString(), error: null }
  } catch {
    return { url: null, error: 'Invalid URL' }
  }
}

/**
 * Parses and validates everything that doesn't need the database: URL syntax,
 * alias format/reserved words, and duplicate aliases within the file.
 */
export function parseImport(text: string): ParsedImport {
  if (!text.trim()) return { error: 'CSV is empty' }
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return { error: 'CSV exceeds the 2 MB limit' }
  const table = parseCsv(text).filter((cells) => cells.some((cell) => cell.trim() !== ''))
  if (table.length < 2) return { error: 'CSV must contain a header and at least one row' }
  if (table.length - 1 > MAX_IMPORT_ROWS) return { error: `Max ${MAX_IMPORT_ROWS} links per import` }
  const detected = detectColumns(table[0])
  if ('error' in detected) return detected
  const { columns, source } = detected
  const cellOf = (cells: string[], column: number) => (column === -1 ? '' : stripControl(cells[column] ?? ''))
  const rows = buildImportRows(
    table.slice(1).map((cells) => ({
      url: cellOf(cells, columns.url),
      alias: cellOf(cells, columns.alias) || (columns.shortLink !== -1 ? aliasFromShortLink(cellOf(cells, columns.shortLink)) : null),
      title: cellOf(cells, columns.title),
      tags: columns.tags === -1 ? [] : parseImportTags(cellOf(cells, columns.tags)),
    })),
    2,
  )
  return { source, rows, totalRows: rows.length }
}

export type ConflictPolicy = 'skip' | 'generate'

export type ImportResult = { row: number; status: 'created' | 'skipped'; shortCode?: string; originalUrl?: string; reason?: string }

/** Runs async work over items with bounded parallelism, preserving order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

export function freshShortCode(taken: Set<string>): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateShortCode()
    if (!taken.has(code) && !isReservedCode(code)) return code
  }
  return generateShortCode(10)
}

export type RawImportRecord = { url: string; alias: string | null; title: string; tags: string[] }

/**
 * Validates source records (CSV cells or provider API items) into import rows
 * with the same rules: URL safety, alias shape, reserved words, duplicates.
 * `firstRow` is the number shown to users for the first record.
 */
export function buildImportRows(records: RawImportRecord[], firstRow: number): ImportRow[] {
  const seenAliases = new Map<string, number>()
  return records.map((record, index) => {
    const row = index + firstRow
    const rawUrl = stripControl(record.url)
    const { url, error: urlError } = validateImportUrl(rawUrl)
    let alias = record.alias ? stripControl(record.alias).replace(/^\/+/, '') : null
    let error = urlError
    if (alias) {
      if (!ALIAS.test(alias)) error ??= 'Alias must be 3–64 letters, numbers, _ or -'
      else if (isReservedCode(alias)) error ??= 'Alias is reserved'
      else {
        // Short codes are case-sensitive in storage but users read them case-insensitively.
        const key = alias.toLowerCase()
        const first = seenAliases.get(key)
        if (first !== undefined) error ??= `Alias already used on row ${first}`
        else seenAliases.set(key, row)
      }
    } else alias = null
    return {
      row,
      url,
      rawUrl: rawUrl.slice(0, MAX_IMPORT_URL_LENGTH),
      alias,
      title: stripControl(record.title).slice(0, 200) || null,
      tags: record.tags,
      error,
    }
  })
}
