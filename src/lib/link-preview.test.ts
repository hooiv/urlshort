import { describe, expect, it } from 'vitest'
import { buildLinkPreview, type PreviewLink } from './link-preview'

const base: PreviewLink = { shortCode: 'abc', originalUrl: 'https://example.com/a?b=1', title: 'T', description: 'D', isActive: true, deletedAt: null, startsAt: null, expiresAt: null, maxClicks: null, clicks: 0, passwordHash: null, cloaked: false }
const now = new Date('2026-01-10T00:00:00Z')

describe('buildLinkPreview', () => {
  it('reveals destination for plain live links', () => {
    const p = buildLinkPreview(base, now)!
    expect(p).toMatchObject({ status: 'live', host: 'example.com', destination: base.originalUrl, secure: true, title: 'T' })
    expect(p.safety?.status).toBe('cleared')
  })
  it('hides everything but the lock state for password links', () => {
    const p = buildLinkPreview({ ...base, passwordHash: 'x' }, now)!
    expect(p).toMatchObject({ protectedByPassword: true, host: null, destination: null, title: null, description: null })
  })
  it('hides path and metadata for cloaked links but keeps host', () => {
    const p = buildLinkPreview({ ...base, cloaked: true }, now)!
    expect(p.destination).toBeNull(); expect(p.host).toBe('example.com'); expect(p.title).toBeNull()
  })
  it('reports lifecycle status', () => {
    expect(buildLinkPreview({ ...base, isActive: false }, now)!.status).toBe('disabled')
    expect(buildLinkPreview({ ...base, startsAt: new Date('2026-02-01') }, now)!.status).toBe('scheduled')
    expect(buildLinkPreview({ ...base, expiresAt: new Date('2026-01-01') }, now)!.status).toBe('expired')
    expect(buildLinkPreview({ ...base, maxClicks: 5, clicks: 5 }, now)!.status).toBe('limit_reached')
  })
  it('returns null for trashed links and flags risky http destinations', () => {
    expect(buildLinkPreview({ ...base, deletedAt: now }, now)).toBeNull()
    const p = buildLinkPreview({ ...base, originalUrl: 'http://1.2.3.4/x' }, now)!
    expect(p.secure).toBe(false); expect(p.safety?.status).toBe('review')
  })
  it('never exposes non-http destinations', () => {
    const p = buildLinkPreview({ ...base, originalUrl: 'javascript:alert(1)' }, now)!
    expect(p.destination).toBeNull(); expect(p.host).toBeNull(); expect(p.safety?.status).toBe('review')
  })
})
