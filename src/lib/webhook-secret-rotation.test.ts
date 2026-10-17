import { describe, expect, it } from 'vitest'
import { activeWebhookSecrets, buildRotation, parseGraceHours } from './webhook-secret-rotation'
import { signWebhookPayloadMulti, verifyTimestampedWebhookSignature } from './webhook-filters'

const now = new Date('2026-10-17T00:00:00Z')

describe('webhook secret rotation', () => {
  it('co-signs with the previous secret only until it expires', () => {
    const e = { secret: 'new', previousSecret: 'old', previousSecretExpiresAt: new Date(now.getTime() + 1000) }
    expect(activeWebhookSecrets(e, now)).toEqual(['new', 'old'])
    expect(activeWebhookSecrets(e, new Date(now.getTime() + 2000))).toEqual(['new'])
    expect(activeWebhookSecrets({ secret: 'new' }, now)).toEqual(['new'])
  })
  it('receivers holding either secret verify the same header', () => {
    const header = signWebhookPayloadMulti('{"a":1}', ['new', 'old'], 1000)
    const opts = { nowSeconds: 1000 }
    expect(verifyTimestampedWebhookSignature('{"a":1}', 'new', header, opts)).toBe(true)
    expect(verifyTimestampedWebhookSignature('{"a":1}', 'old', header, opts)).toBe(true)
    expect(verifyTimestampedWebhookSignature('{"a":1}', 'other', header, opts)).toBe(false)
  })
  it('validates grace hours', () => {
    expect(parseGraceHours(undefined)).toEqual({ ok: true, hours: 24 })
    expect(parseGraceHours(0)).toEqual({ ok: true, hours: 0 })
    expect(parseGraceHours(169).ok).toBe(false)
    expect(parseGraceHours(-1).ok).toBe(false)
    expect(parseGraceHours(1.5).ok).toBe(false)
    expect(parseGraceHours('5').ok).toBe(false)
  })
  it('builds rotation with and without grace', () => {
    const r = buildRotation('old', 2, now)
    expect(r.data.previousSecret).toBe('old')
    expect(r.data.previousSecretExpiresAt?.getTime()).toBe(now.getTime() + 7_200_000)
    expect(r.secret).not.toBe('old')
    expect(buildRotation('old', 0, now).data.previousSecret).toBeNull()
  })
})
