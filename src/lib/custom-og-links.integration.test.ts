import { describe, expect, it } from 'vitest'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe.skipIf(!databaseUrl)('custom-og-links (postgres)', () => {
  it('lists only links with a custom preview, most clicked first', async () => {
    process.env.DATABASE_URL = databaseUrl
    const { prisma } = await import('./prisma')
    const { findCustomOgLinks } = await import('./custom-og-links')
    const tag = `cl${Date.now()}`
    const user = await prisma.user.create({ data: { email: `${tag}@t.dev`, password: 'x' } })
    const base = { originalUrl: 'https://example.com', userId: user.id }
    await prisma.url.create({ data: { ...base, shortCode: `${tag}a`, ogImage: "https://example.com/a.png", clicks: 5 } })
    await prisma.url.create({ data: { ...base, shortCode: `${tag}b`, description: "hello", clicks: 9 } })
    await prisma.url.create({ data: { ...base, shortCode: `${tag}c` } })
    const res = await findCustomOgLinks({ kind: 'user', userId: user.id } as never, 10)
    expect(res.total).toBe(2)
    expect(res.links.map((l) => l.shortCode)).toEqual([`${tag}b`, `${tag}a`])
    expect(res.links[0]).toMatchObject({ description: "hello", ogImage: null })
    await prisma.$disconnect()
  })
})
