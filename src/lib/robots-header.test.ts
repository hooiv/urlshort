import { describe, expect, it } from 'vitest'
import { applyRobotsHeader, ROBOTS_NOINDEX } from './robots-header'

describe('applyRobotsHeader', () => {
  it('sets noindex without nofollow and returns the same response', () => {
    const res = new Response(null, { status: 302 })
    expect(applyRobotsHeader(res)).toBe(res)
    expect(res.headers.get('X-Robots-Tag')).toBe(ROBOTS_NOINDEX)
    expect(res.headers.get('X-Robots-Tag')).not.toMatch(/nofollow/)
  })
  it('overwrites an existing value', () => {
    const res = new Response(null, { headers: { 'X-Robots-Tag': 'all' } })
    applyRobotsHeader(res)
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex')
  })
})
