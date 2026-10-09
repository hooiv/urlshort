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

import { serializeCsv } from '@/lib/csv';
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseImport, type ImportResult, type ImportSource } from '@/lib/bulk-import';

/** Mirrors the server caps; both sides share the same parser. */
export const MAX_BULK_ROWS = MAX_IMPORT_ROWS;
export const MAX_BULK_CSV_BYTES = MAX_IMPORT_BYTES;
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
  /** Which platform's export the header looks like. */
  source?: ImportSource;
};

export type { ImportResult, ImportSource };

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

const SOURCE_LABELS: Record<ImportSource, string> = {
  quicklink: 'QuickLink template',
  bitly: 'Bitly export',
  rebrandly: 'Rebrandly export',
  shortio: 'Short.io export',
  dub: 'Dub export',
  generic: 'CSV',
};
export const sourceLabel = (source: ImportSource) => SOURCE_LABELS[source];

/**
 * Quote-aware preview of pasted/file CSV content, using the exact parser the
 * server runs, so every error shown here is the error the import will report.
 * Rows beyond `sampleSize` are counted in `totalRows` but not returned.
 */
export function parseBulkPreview(csvText: string, sampleSize: number = PREVIEW_SAMPLE_SIZE): BulkPreview {
  if (!csvText.trim()) return { totalRows: 0, rows: [], headerError: null };
  const parsed = parseImport(csvText);
  if ('error' in parsed) {
    if (/at least one row/.test(parsed.error)) return { totalRows: 0, rows: [], headerError: null };
    return { totalRows: 0, rows: [], headerError: parsed.error };
  }
  const rows = parsed.rows.slice(0, sampleSize).map((row, idx) => ({
    id: idx,
    url: row.url ?? sanitizeBulkUrl(row.rawUrl),
    title: row.title ?? '',
    alias: row.alias ?? '',
    isValid: row.error === null,
    error: row.error,
  }));
  return { totalRows: parsed.totalRows, rows, headerError: null, source: parsed.source };
}

/**
 * Client-side gate before POSTing, mirroring the server's 400 rules so
 * oversized or header-less payloads fail fast with the same message.
 */
export function validateBulkCsv(csvText: string): { error: string | null; totalRows: number } {
  if (!csvText.trim()) return { error: 'CSV data is empty', totalRows: 0 };
  const parsed = parseImport(csvText);
  if ('error' in parsed) return { error: parsed.error, totalRows: 0 };
  return { error: null, totalRows: parsed.totalRows };
}

/** Created vs skipped, for the toast. The server's per-row report has the reasons. */
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

/** Skipped rows with reasons, so users can fix and re-import just those. */
export function buildSkippedCsv(results: ImportResult[]): string {
  return serializeCsv([
    ['row', 'originalUrl', 'reason'],
    ...results.filter((r) => r.status === 'skipped').map((r) => [String(r.row), r.originalUrl ?? '', r.reason ?? '']),
  ]);
}
