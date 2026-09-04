import { describe, expect, it } from 'vitest'
import { formatCurrency, formatNumber } from './format'

describe('dashboard formatting', () => {
  it('formats counts with thousands separators and tolerates bad input', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(NaN)).toBe('0')
  })

  it('formats integer cents as whole dollars', () => {
    expect(formatCurrency(123456)).toBe('$1,235')
    expect(formatCurrency(0)).toBe('$0')
  })
})
