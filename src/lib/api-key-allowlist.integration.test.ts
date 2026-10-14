import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe.skipIf(!databaseUrl)('API key allowlist (real Postgres)', () => {
  it('persists allowedIps and enforces them on auth', async () => {
    process.env.DATABASE_URL = databaseUrl
    const { prisma } = await import('./prisma')
    const { createApiKey, authenticateApiKey } = await import('./api-keys')
    const user = await prisma.user.create({ data: { email: `allow-${Date.now()}@example.com`, password: 'x' } })
    try {
      const { key, keyHash, prefix } = createApiKey()
      await prisma.apiKey.create({ data: { userId: user.id, name: 't', keyHash, prefix, allowedIps: ['10.1.0.0/16'] } })
      const req = (ip: string) => new NextRequest('http://localhost/x', { headers: { 'x-api-key': key, 'x-forwarded-for': ip } })
      expect(await authenticateApiKey(req('10.1.2.3'))).toMatchObject({ userId: user.id })
      expect(await authenticateApiKey(req('10.2.0.1'))).toBeNull()
      await prisma.apiKey.updateMany({ where: { keyHash }, data: { allowedIps: [] } })
      expect(await authenticateApiKey(req('10.2.0.1'))).toMatchObject({ userId: user.id })
    } finally {
      await prisma.user.delete({ where: { id: user.id } })
    }
  })
})
