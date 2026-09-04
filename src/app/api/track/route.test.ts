import { describe, expect, it } from 'vitest'
import { dateKey } from './route'

describe('dateKey', () => {
  it('formats the UTC date prefix', () => {
    expect(dateKey(new Date('2026-03-04T05:06:07.000Z'))).toBe('2026-03-04')
  })
})
