import { describe, expect, it } from 'vitest'
import { parseTargetInput } from './ClickForecast'

describe('parseTargetInput', () => {
  it('treats empty as no target', () => expect(parseTargetInput('  ')).toBeUndefined())
  it('accepts separators', () => expect(parseTargetInput('10,000')).toBe(10000))
  it('rejects junk and out of range', () => {
    expect(parseTargetInput('abc')).toBeNull()
    expect(parseTargetInput('0')).toBeNull()
    expect(parseTargetInput('1000000001')).toBeNull()
  })
})
