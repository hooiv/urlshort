import { describe, expect, it } from 'vitest';
import {
  BULK_SAMPLE_CSV,
  buildResultsCsv,
  getBulkUrlError,
  isValidBulkUrl,
  parseBulkPreview,
  sanitizeBulkUrl,
  summarizeBulkImport,
  validateBulkCsv,
} from './bulkCsv';

describe('sanitizeBulkUrl', () => {
  it('trims whitespace and strips pasted control characters', () => {
    expect(sanitizeBulkUrl('  https://example.com/a\r\n\t')).toBe('https://example.com/a');
  });

  it('caps over-long input at 2048 chars', () => {
    expect(sanitizeBulkUrl(`https://example.com/${'x'.repeat(5000)}`)).toHaveLength(2048);
  });
});

describe('isValidBulkUrl / getBulkUrlError', () => {
  it('accepts http and https URLs with a host', () => {
    expect(isValidBulkUrl('https://example.com/sale?q=1')).toBe(true);
    expect(getBulkUrlError('https://example.com')).toBeNull();
  });

  it('rejects the old preview regex false-positives', () => {
    // The previous `/^https?:\/\/.+/i` check accepted all of these.
    expect(getBulkUrlError('https://')).not.toBeNull();
    expect(getBulkUrlError('https:// ')).not.toBeNull();
    expect(getBulkUrlError('')).toBe('Missing URL');
  });

  it('rejects dangerous and non-web schemes', () => {
    expect(isValidBulkUrl('javascript:alert(1)')).toBe(false);
    expect(isValidBulkUrl('ftp://example.com/f')).toBe(false);
    expect(isValidBulkUrl('example.com/no-scheme')).toBe(false);
  });
});

describe('parseBulkPreview', () => {
  it('returns an empty preview for blank input', () => {
    expect(parseBulkPreview('   ')).toEqual({ totalRows: 0, rows: [], headerError: null });
  });

  it('parses quoted fields containing commas (the old split(",") broke these)', () => {
    const csv = 'originalUrl,title,customAlias,tags\nhttps://example.com/a,"Summer, Special",sale-1,"promo; summer"';
    const preview = parseBulkPreview(csv);
    expect(preview.headerError).toBeNull();
    expect(preview.totalRows).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      url: 'https://example.com/a',
      title: 'Summer, Special',
      alias: 'sale-1',
      isValid: true,
    });
  });

  it('flags invalid rows individually instead of one bad row failing the batch', () => {
    const csv = 'originalUrl,title\nhttps://example.com/ok,Good\nnot-a-url,Bad';
    const preview = parseBulkPreview(csv);
    expect(preview.totalRows).toBe(2);
    expect(preview.rows[0].isValid).toBe(true);
    expect(preview.rows[1].isValid).toBe(false);
    expect(preview.rows[1].error).toMatch(/Invalid URL/);
  });

  it('reports a missing originalUrl column via headerError', () => {
    expect(parseBulkPreview('title,alias\nHello,hi').headerError).toMatch(/originalUrl/);
  });

  it('counts all rows but samples only the first nine', () => {
    const body = Array.from({ length: 12 }, (_, i) => `https://example.com/${i},T${i}`).join('\n');
    const preview = parseBulkPreview(`originalUrl,title\n${body}`);
    expect(preview.totalRows).toBe(12);
    expect(preview.rows).toHaveLength(9);
  });

  it('handles headers case-insensitively and the shipped sample template', () => {
    const preview = parseBulkPreview(BULK_SAMPLE_CSV);
    expect(preview.headerError).toBeNull();
    expect(preview.totalRows).toBe(3);
    expect(preview.rows.every((r) => r.isValid)).toBe(true);
  });
});

describe('validateBulkCsv', () => {
  it('rejects empty input and header-only input like the server does', () => {
    expect(validateBulkCsv('  ').error).toBe('CSV data is empty');
    expect(validateBulkCsv('originalUrl,title').error).toMatch(/header and at least one row/);
  });

  it('enforces the 500-row server cap before uploading', () => {
    const body = Array.from({ length: 501 }, (_, i) => `https://example.com/${i}`).join('\n');
    expect(validateBulkCsv(`originalUrl\n${body}`).error).toBe('Max 500 links per bulk import');
    const okBody = Array.from({ length: 500 }, (_, i) => `https://example.com/${i}`).join('\n');
    expect(validateBulkCsv(`originalUrl\n${okBody}`)).toEqual({ error: null, totalRows: 500 });
  });

  it('rejects payloads over the 1MB upload guard', () => {
    expect(validateBulkCsv(`originalUrl\nhttps://example.com/${'x'.repeat(2_000_000)}`).error).toMatch(/1MB/);
  });

  it('requires the originalUrl column', () => {
    expect(validateBulkCsv('title\nhi').error).toBe('Missing originalUrl column');
  });
});

describe('summarizeBulkImport', () => {
  it('computes skipped rows so partial failures are reported, not hidden', () => {
    expect(summarizeBulkImport(10, 7)).toEqual({ created: 7, skipped: 3 });
    expect(summarizeBulkImport(3, 3)).toEqual({ created: 3, skipped: 0 });
    expect(summarizeBulkImport(0, 0)).toEqual({ created: 0, skipped: 0 });
  });
});

describe('buildResultsCsv', () => {
  it('emits a header plus one row per link with absolute short URLs', () => {
    const csv = buildResultsCsv(
      [{ originalUrl: 'https://example.com/a', shortCode: 'abc123' }],
      'https://quicklink.to'
    );
    expect(csv).toBe(
      '"originalUrl","shortCode","shortUrl"\n"https://example.com/a","abc123","https://quicklink.to/abc123"'
    );
  });

  it('escapes embedded quotes instead of corrupting the CSV', () => {
    const csv = buildResultsCsv(
      [{ originalUrl: 'https://example.com/say-"hi"', shortCode: 'x' }],
      'https://quicklink.to'
    );
    expect(csv).toContain('say-""hi""');
  });
});
