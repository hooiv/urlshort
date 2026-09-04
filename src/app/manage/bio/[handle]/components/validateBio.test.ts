import { describe, expect, it } from 'vitest';
import { getBlockUrlError, sanitizeBlockUrl } from './validateBio';

describe('sanitizeBlockUrl', () => {
  it('trims whitespace and strips pasted control characters', () => {
    expect(sanitizeBlockUrl('  https://example.com/a\r\n\t')).toBe('https://example.com/a');
  });

  it('caps absurdly long input instead of sending it to the API', () => {
    expect(sanitizeBlockUrl(`https://example.com/${'a'.repeat(5000)}`)).toHaveLength(2048);
  });
});

describe('getBlockUrlError', () => {
  it('allows empty drafts so unfinished blocks are not flagged', () => {
    expect(getBlockUrlError('')).toBeNull();
    expect(getBlockUrlError(null)).toBeNull();
    expect(getBlockUrlError(undefined)).toBeNull();
  });

  it('accepts http and https URLs', () => {
    expect(getBlockUrlError('https://example.com/path?q=1')).toBeNull();
    expect(getBlockUrlError('http://example.com')).toBeNull();
  });

  it('rejects half-typed input that the old code persisted on every keystroke', () => {
    expect(getBlockUrlError('https://')).not.toBeNull();
    expect(getBlockUrlError('htt')).not.toBeNull();
    expect(getBlockUrlError('not a url')).not.toBeNull();
  });

  it('rejects non-web schemes such as javascript: and ftp:', () => {
    expect(getBlockUrlError('javascript:alert(1)')).not.toBeNull();
    expect(getBlockUrlError('ftp://example.com/file')).not.toBeNull();
  });
});
