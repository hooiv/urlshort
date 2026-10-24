import { describe, expect, it } from 'vitest'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe.skipIf(!databaseUrl)('pixel-links (postgres)', () => {
  it('lists only links with a pixel and names the platforms', async () => {
    process.env.DATABASE_URL = databaseUrl
    const { prisma } = await import('./prisma')
    const { findPixelLinks } = await import('./pixel-links')
    const tag = `px${Date.now()}`
    const user = await prisma.user.create({ data: { email: `${tag}@t.dev`, password: 'x' } })
    const base = { originalUrl: 'https://example.com', userId: user.id }
    await prisma.url.create({ data: { ...base, shortCode: `${tag}a`, metaPixelId: '111', tiktokPixelId: 'T1', clicks: 5 } })
    await prisma.url.create({ data: { ...base, shortCode: `${tag}b`, metaPixelId: '', clicks: 9 } })
    await prisma.url.create({ data: { ...base, shortCode: `${tag}c` } })
    const res = await findPixelLinks({ kind: 'user', userId: user.id } as never, 10)
    expect(res.total).toBe(1)
    expect(res.links[0]).toMatchObject({ shortCode: `${tag}a`, platforms: ['Meta', 'TikTok'] })
    await prisma.$disconnect()
  })
})
