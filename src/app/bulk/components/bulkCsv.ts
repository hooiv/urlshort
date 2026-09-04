/**
 * Pure bulk-import logic: CSV parsing, URL validation/sanitization, import
 * summaries, and results-CSV building.
 *
 * Kept separate from the React page so it is unit-testable in the node
 * vitest environment (no DOM). The quote-aware parsing reuses the shared
 * RFC 4180 parser in `@/lib/csv` — the page's old inline `line.split(',')`
 * misparsed any quoted field containing a comma, including the tags column
 * of the page's own sample template.
 */

import { parseCsv, serializeCsv } from '@/lib/csv';

/** Mirrors the server cap (`Max 500 links per bulk import`, header + 500 rows). */
export const MAX_BULK_ROWS = 500;
export const MAX_BULK_CSV_BYTES = 1_000_000;
export const MAX_BULK_URL_LENGTH = 2048;
export const PREVIEW_SAMPLE_SIZE = 9;

export const BULK_SAMPLE_CSV = `originalUrl,title,customAlias,tags
https://example.com/summer-sale,Summer Promotion,summer-sale-2026,"promo; summer"
https://example.com/mobile-app,Mobile App Download,app-download,"mobile; app"
https://example.com/webinar,Product Webinar,webinar-q3,"webinar; product"`;

export type BulkPreviewRow = {
  id: number;
  url: string;
  title: string;
  alias: string;
  isValid: boolean;
  error: string | null;
};

export type BulkPreview = {
  /** Data rows excluding the header. */
  totalRows: number;
  rows: BulkPreviewRow[];
  /** Set when the header row is missing the required column. */
  headerError: string | null;
};

export type ImportedBulkLink = {
  originalUrl: string;
  shortCode: string;
  title?: string | null;
  tags?: string[];
};

/** Trim and strip control characters from pasted/file-uploaded URLs. */
export function sanitizeBulkUrl(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, MAX_BULK_URL_LENGTH);
}

/** Strict http(s) check; rejects `javascript:`, `ftp:`, bare hosts, etc. */
export function isValidBulkUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** User-facing reason a pasted URL will be skipped, or null when importable. */
export function getBulkUrlError(raw: string): string | null {
  const url = sanitizeBulkUrl(raw);
  if (!url) return 'Missing URL';
  if (raw.trim().length > MAX_BULK_URL_LENGTH) {
    return `URL must be ${MAX_BULK_URL_LENGTH} characters or fewer`;
  }
  if (!isValidBulkUrl(url)) return 'Invalid URL syntax (needs http:// or https://)';
  return null;
}

function columnIndex(header: string[], name: string): number {
  return header.findIndex((cell) => cell.trim().toLowerCase() === name);
}

/**
 * Quote-aware preview of pasted/file CSV content. Rows beyond
 * `sampleSize` are counted in `totalRows` but not returned.
 */
export function parseBulkPreview(csvText: string, sampleSize: number = PREVIEW_SAMPLE_SIZE): BulkPreview {
  if (!csvText.trim()) return { totalRows: 0, rows: [], headerError: null };
  const table = parseCsv(csvText);
  if (table.length === 0) return { totalRows: 0, rows: [], headerError: null };

  const header = table[0];
  const urlIdx = columnIndex(header, 'originalurl');
  if (urlIdx === -1) return { totalRows: 0, rows: [], headerError: 'Missing originalUrl column' };
  const titleIdx = columnIndex(header, 'title');
  const aliasIdx = columnIndex(header, 'customalias');

  const totalRows = table.length - 1;
  const rows = table.slice(1, 1 + sampleSize).map((cells, idx) => {
    const url = sanitizeBulkUrl(cells[urlIdx] ?? '');
    const error = getBulkUrlError(cells[urlIdx] ?? '');
    return {
      id: idx,
      url,
      title: titleIdx !== -1 ? (cells[titleIdx] ?? '').trim() : '',
      alias: aliasIdx !== -1 ? (cells[aliasIdx] ?? '').trim() : '',
      isValid: error === null,
      error,
    };
  });
  return { totalRows, rows, headerError: null };
}

/**
 * Client-side gate before POSTing, mirroring the server's 400 rules so
 * oversized or header-less payloads fail fast with the same message.
 */
export function validateBulkCsv(csvText: string): { error: string | null; totalRows: number } {
  if (!csvText.trim()) return { error: 'CSV data is empty', totalRows: 0 };
  if (new TextEncoder().encode(csvText).length > MAX_BULK_CSV_BYTES) {
    return { error: 'CSV exceeds the 1MB upload limit', totalRows: 0 };
  }
  const table = parseCsv(csvText);
  if (table.length < 2) {
    return { error: 'CSV must contain a header and at least one row', totalRows: 0 };
  }
  if (table.length - 1 > MAX_BULK_ROWS) {
    return { error: 'Max 500 links per bulk import', totalRows: table.length - 1 };
  }
  if (columnIndex(table[0], 'originalurl') === -1) {
    return { error: 'Missing originalUrl column', totalRows: table.length - 1 };
  }
  return { error: null, totalRows: table.length - 1 };
}

/**
 * Partial-failure summary: the API silently skips invalid rows, so the
 * created count can be lower than the submitted row count. Callers report
 * both numbers instead of claiming full success.
 */
export function summarizeBulkImport(totalRows: number, createdCount: number): {
  created: number;
  skipped: number;
} {
  const created = Math.max(0, createdCount);
  return { created, skipped: Math.max(0, totalRows - created) };
}

/** RFC 4180 results export with proper quoting/escaping of embedded quotes. */
export function buildResultsCsv(links: ImportedBulkLink[], origin: string): string {
  return serializeCsv([
    ['originalUrl', 'shortCode', 'shortUrl'],
    ...links.map((l) => [l.originalUrl, l.shortCode, `${origin}/${l.shortCode}`]),
  ]);
}
