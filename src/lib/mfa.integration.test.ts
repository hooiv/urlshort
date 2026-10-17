import { describe, expect, it, beforeAll, afterAll } from 'vitest'
const databaseUrl = process.env.SOAK_DATABASE_URL
describe.skipIf(!databaseUrl)('mfa on real Postgres', () => {
  let prisma: typeof import('@/lib/prisma').prisma
  let mfa: typeof import('@/lib/mfa')
  let totp: typeof import('@/lib/totp')
  let userId = ''
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.QL_MFA_KEY = 'k'.repeat(40)
    prisma = (await import('@/lib/prisma')).prisma
    mfa = await import('@/lib/mfa')
    totp = await import('@/lib/totp')
    userId = (await prisma.user.create({ data: { email: `mfa-${Date.now()}@t.io`, password: 'x' } })).id
  })
  afterAll(async () => { await prisma.user.delete({ where: { id: userId } }); await prisma.$disconnect() })
  it('enrols, blocks replay, consumes recovery codes once, disables', async () => {
    const { secret } = await mfa.beginTotpSetup(userId, 'a@b.c')
    const t0 = Date.now()
    const ctr = Math.floor(t0 / 30000)
    expect(await mfa.enableTotp(userId, '000000', t0)).toBeNull()
    const codes = await mfa.enableTotp(userId, totp.totpCode(secret, ctr), t0)
    expect(codes).toHaveLength(10)
    expect(await mfa.verifySecondFactor(userId, totp.totpCode(secret, ctr), t0)).toBeNull() // replay
    expect(await mfa.verifySecondFactor(userId, totp.totpCode(secret, ctr + 1), t0 + 30000)).toBe('totp')
    expect(await mfa.verifySecondFactor(userId, codes![0], t0)).toBe('recovery')
    expect(await mfa.verifySecondFactor(userId, codes![0], t0)).toBeNull()
    expect((await mfa.mfaStatus(userId)).recoveryCodesRemaining).toBe(9)
    await mfa.disableTotp(userId)
    expect((await mfa.mfaStatus(userId)).enabled).toBe(false)
  })
})
