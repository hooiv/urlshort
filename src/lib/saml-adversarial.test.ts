import { describe, expect, it, vi } from 'vitest'
const prismaMock = vi.hoisted(() => ({ samlRelayNonce: { deleteMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
import { createSamlRelayState, verifySamlRelayState } from './saml'

describe('SAML relay adversarial validation', () => {
  it('rejects modified signed state, cross-connection state, and malformed payloads', async () => {
    process.env.SSO_STATE_SECRET = 'adversarial-secret'
    prismaMock.samlRelayNonce.deleteMany.mockResolvedValue({ count: 0 }); prismaMock.samlRelayNonce.create.mockResolvedValue({}); prismaMock.samlRelayNonce.updateMany.mockResolvedValue({ count: 1 })
    const relay = await createSamlRelayState('conn-a', '/dashboard'); const [body,sig] = relay.split('.')
    expect(await verifySamlRelayState(`${body}.${sig.slice(0,-1)}x`, 'conn-a')).toBeNull(); expect(await verifySamlRelayState(relay, 'conn-b')).toBeNull(); expect(await verifySamlRelayState('not-a-relay-state', 'conn-a')).toBeNull()
  })
  it('normalizes open redirects and rejects oversized relay state', async () => {
    process.env.SSO_STATE_SECRET = 'adversarial-secret'; prismaMock.samlRelayNonce.create.mockResolvedValue({}); prismaMock.samlRelayNonce.updateMany.mockResolvedValue({count:1})
    const relay = await createSamlRelayState('conn-a', 'https://evil.example'); const raw = Buffer.from(relay.split('.')[0], 'base64url').toString(); expect(JSON.parse(raw).returnTo).toBe('/dashboard'); expect(await verifySamlRelayState('x'.repeat(20000), 'conn-a')).toBeNull()
  })
  it('allows one nonce consumption and rejects replay', async () => {
    process.env.SSO_STATE_SECRET = 'adversarial-secret'; const consumed = new Set<string>(); prismaMock.samlRelayNonce.updateMany.mockImplementation(async ({where}:{where:{nonce:string}}) => { if(consumed.has(where.nonce)) return {count:0}; consumed.add(where.nonce); return {count:1} })
    const relay = await createSamlRelayState('conn-a', '/dashboard'); expect(await verifySamlRelayState(relay,'conn-a')).not.toBeNull(); expect(await verifySamlRelayState(relay,'conn-a')).toBeNull()
  })
})
