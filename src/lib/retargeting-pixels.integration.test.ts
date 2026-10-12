import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres check: new pixel columns persist and are read back as active pixels. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: retargeting pixels', () => {
  it.skipIf(!databaseUrl)('stores LinkedIn/TikTok ids and yields them as active pixels', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { activePixels } = await import('./retargeting-pixels')
    const code = `px${Date.now().toString(36)}`
    try {
      await db.url.create({ data: { shortCode: code, originalUrl: 'https://example.com', metaPixelId: '1234567890', linkedinPartnerId: '123456', tiktokPixelId: 'C4ABCDEFGHIJ' } })
      const row = await db.url.findUniqueOrThrow({ where: { shortCode: code } })
      expect(activePixels(row).map((p) => p.provider)).toEqual(['meta', 'linkedin', 'tiktok'])
    } finally {
      await db.url.deleteMany({ where: { shortCode: code } })
      await db.$disconnect()
    }
  })
})
