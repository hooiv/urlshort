import { describe, expect, it } from 'vitest'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe.skipIf(!databaseUrl)('real database: click export', () => {
  it('pages through 2,500 clicks without gaps or duplicates', async () => {
    process.env.DATABASE_URL = databaseUrl
    const { prisma } = await import('./prisma')
    const { iterateClicks } = await import('./click-export')
    const code = `cx${Date.now().toString(36)}`
    const url = await prisma.url.create({ data: { originalUrl: 'https://example.com', shortCode: code } })
    try {
      const base = Date.parse('2026-09-01T00:00:00Z')
      await prisma.clickEvent.createMany({
        data: Array.from({ length: 2500 }, (_, i) => ({ urlId: url.id, createdAt: new Date(base + Math.floor(i / 50) * 1000), country: 'IN' })),
      })
      const ids = new Set<string>()
      let total = 0
      let prev = 0
      for await (const page of iterateClicks(url.id, { from: new Date(base - 1000), to: new Date(base + 10_000_000) })) {
        for (const r of page) {
          ids.add(r.id); total++
          expect(r.createdAt.getTime()).toBeGreaterThanOrEqual(prev)
          prev = r.createdAt.getTime()
        }
      }
      expect(total).toBe(2500)
      expect(ids.size).toBe(2500)
    } finally {
      await prisma.url.delete({ where: { id: url.id } })
      await prisma.$disconnect()
    }
  }, 60_000)
})
