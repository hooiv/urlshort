import { describe, expect, it } from 'vitest'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe.skipIf(!databaseUrl)('blocklisted-links (postgres)', () => {
  it('lists only links with a visitor blocklist, most clicked first', async () => {
    process.env.DATABASE_URL = databaseUrl
    const { prisma } = await import('./prisma')
    const { findBlocklistedLinks } = await import('./blocklisted-links')
    const tag = `cl${Date.now()}`
    const user = await prisma.user.create({ data: { email: `${tag}@t.dev`, password: 'x' } })
    const base = { originalUrl: 'https://example.com', userId: user.id }
    await prisma.url.create({ data: { ...base, shortCode: `${tag}a`, visitorBlock: { cidrs: ["10.0.0.0/8"], referrerHosts: [] }, clicks: 5 } })
    await prisma.url.create({ data: { ...base, shortCode: `${tag}b`, visitorBlock: { cidrs: [], referrerHosts: ["a.com","b.com"] }, clicks: 9 } })
    await prisma.url.create({ data: { ...base, shortCode: `${tag}c` } })
    const res = await findBlocklistedLinks({ kind: 'user', userId: user.id } as never, 10)
    expect(res.total).toBe(2)
    expect(res.links.map((l) => l.shortCode)).toEqual([`${tag}b`, `${tag}a`])
    expect(res.links[0]).toMatchObject({ cidrs: 0, referrerHosts: 2 })
    await prisma.$disconnect()
  })
})
