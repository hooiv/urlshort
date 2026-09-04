import { describe, expect, it } from 'vitest';
import { MAX_HANDLE_LENGTH, sanitizeHandle, validateHandle } from './sanitizeHandle';

describe('sanitizeHandle', () => {
  it('lowercases and strips characters that are invalid in a handle', () => {
    expect(sanitizeHandle('My-Brand_2026!')).toBe('my-brand2026');
  });

  it('removes whitespace, slashes, and other route-breaking input', () => {
    expect(sanitizeHandle('  a/b\\c d ')).toBe('abcd');
  });

  it('caps the handle at MAX_HANDLE_LENGTH characters', () => {
    expect(sanitizeHandle('a'.repeat(MAX_HANDLE_LENGTH + 10))).toHaveLength(MAX_HANDLE_LENGTH);
  });

  it('leaves already-clean handles untouched', () => {
    expect(sanitizeHandle('your-brand-2')).toBe('your-brand-2');
  });
});

describe('validateHandle', () => {
  it('rejects empty and sanitizer-emptied input', () => {
    expect(validateHandle('')).toBe('Handle is required');
    expect(validateHandle('   ')).toBe('Handle is required');
    expect(validateHandle('___')).toBe('Handle is required');
  });

  it('rejects over-long handles instead of silently truncating them', () => {
    expect(validateHandle('a'.repeat(MAX_HANDLE_LENGTH + 1))).toMatch(/64 characters or fewer/);
  });

  it('accepts a normal handle with surrounding whitespace', () => {
    expect(validateHandle('  my-brand ')).toBeNull();
  });
});
