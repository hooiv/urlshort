import { describe, it, expect } from 'vitest';
import { BIO_THEMES } from './bio-themes';
import { contrastRatio } from './color-contrast';

describe('bio themes accessibility', () => {
  for (const t of Object.values(BIO_THEMES)) {
    it(`${t.id}: primary text readable on page background (AA large+)`, () => {
      const r = contrastRatio(t.pageBg, t.textPrimary);
      if (r !== null) expect(r).toBeGreaterThanOrEqual(3);
    });
  }
});
