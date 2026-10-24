import { describe, expect, it } from 'vitest'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe.skipIf(!databaseUrl)('routed-links (postgres)', () => {
  it('lists only links with rules, counting enabled ones', async () => {
    process.env.DATABASE_URL = databaseUrl
    const { prisma } = await import('./prisma')
    const { findRoutedLinks } = await import('./routed-links')
    const tag = `rt${Date.now()}`
    const user = await prisma.user.create({ data: { email: `${tag}@t.dev`, password: "x" } })
    const mk = (code: string, clicks: number) => prisma.url.create({ data: { shortCode: `${tag}${code}`, originalUrl: 'https://example.com', userId: user.id, clicks } })
    const a = await mk('a', 5)
    await mk('b', 9)
    await prisma.linkRule.createMany({ data: [
      { urlId: a.id, name: 'r1', destinationUrl: 'https://example.com/1', enabled: true },
      { urlId: a.id, name: 'r2', destinationUrl: 'https://example.com/2', enabled: false },
    ] })
    const res = await findRoutedLinks({ kind: 'user', userId: user.id } as never, 10)
    expect(res.total).toBe(1)
    expect(res.links[0]).toMatchObject({ shortCode: `${tag}a`, rules: 2, enabledRules: 1 })
    await prisma.$disconnect()
  })
})
