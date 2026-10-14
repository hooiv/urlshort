import { describe, it, expect } from 'vitest'
import { assessSlugQuality } from './slug-quality'

describe('assessSlugQuality', () => {
  it('scores clean words 100', () => {
    expect(assessSlugQuality('summer-sale')).toEqual({ score: 100, issues: [] })
  })
  it('flags look-alikes in mixed alphanumerics', () => {
    const r = assessSlugQuality('l0ve1')
    expect(r.score).toBeLessThan(100)
    expect(r.issues[0]).toMatch(/look-alike/)
  })
  it('flags long, repeated and mixed case', () => {
    const r = assessSlugQuality('AbcdddddEfghijklmnopqrst')
    expect(r.issues.length).toBe(3)
  })
  it('never goes below zero', () => {
    expect(assessSlugQuality('--Aaa0Oo1lI111111111111111--').score).toBeGreaterThanOrEqual(0)
  })
})
