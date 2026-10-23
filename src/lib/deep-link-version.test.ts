import { describe, expect, it } from 'vitest'
import { versionAtLeast } from './deep-link'

describe('versionAtLeast', () => {
  it('allows everything when no minimum is set', () => {
    expect(versionAtLeast(null, null)).toBe(true)
    expect(versionAtLeast(undefined, '')).toBe(true)
  })
  it('rejects unknown actual versions when a minimum exists', () => {
    expect(versionAtLeast(null, '1.0')).toBe(false)
    expect(versionAtLeast('', '1.0')).toBe(false)
  })
  it('compares numerically per segment, not lexically', () => {
    expect(versionAtLeast('1.10.0', '1.9.9')).toBe(true)
    expect(versionAtLeast('1.9.9', '1.10.0')).toBe(false)
  })
  it('treats missing segments as zero and strips a v prefix', () => {
    expect(versionAtLeast('v2', '2.0.0')).toBe(true)
    expect(versionAtLeast('2.0', '2.0.1')).toBe(false)
  })
  it('treats garbage segments as zero rather than throwing', () => {
    expect(versionAtLeast('x.y', '0.0')).toBe(true)
    expect(versionAtLeast('-1.0', '0.1')).toBe(false)
  })
})
