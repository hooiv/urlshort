import { describe, expect, it } from 'vitest'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe.skipIf(!databaseUrl)('cloaked-links (postgres)', () => {
  it('lists only cloaked links, most clicked first', async () => {
    process.env.DATABASE_URL = databaseUrl
    const { prisma } = await import('./prisma')
    const { findCloakedLinks } = await import('./cloaked-links')
    const tag = `cl${Date.now()}`
    const user = await prisma.user.create({ data: { email: `${tag}@t.dev`, password: 'x' } })
    const base = { originalUrl: 'https://example.com', userId: user.id }
    await prisma.url.create({ data: { ...base, shortCode: `${tag}a`, cloaked: true, clicks: 5 } })
    await prisma.url.create({ data: { ...base, shortCode: `${tag}b`, cloaked: true, clicks: 9 } })
    await prisma.url.create({ data: { ...base, shortCode: `${tag}c` } })
    const res = await findCloakedLinks({ kind: 'user', userId: user.id } as never, 10)
    expect(res.total).toBe(2)
    expect(res.links.map((l) => l.shortCode)).toEqual([`${tag}b`, `${tag}a`])
    await prisma.$disconnect()
  })
})
