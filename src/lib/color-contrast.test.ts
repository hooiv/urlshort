import { describe, it, expect } from 'vitest';
import { contrastRatio, wcagLevel, readableTextColor, parseHex } from './color-contrast';

describe('color-contrast', () => {
  it('computes extremes', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
  it('rejects invalid hex', () => {
    expect(parseHex('red')).toBeNull();
    expect(contrastRatio('#12', '#fff')).toBeNull();
  });
  it('maps levels', () => {
    expect(wcagLevel(21)).toBe('AAA');
    expect(wcagLevel(4.6)).toBe('AA');
    expect(wcagLevel(3.2)).toBe('AA-large');
    expect(wcagLevel(2)).toBe('fail');
  });
  it('picks readable text', () => {
    expect(readableTextColor('#ffffff')).toBe('#000000');
    expect(readableTextColor('#0a0a0a')).toBe('#ffffff');
    expect(readableTextColor('nope')).toBeNull();
  });
});
