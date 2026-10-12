import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { linkWindowState } from './link-schedule'

/** Real-Postgres check: the start-window columns persist and drive the window state. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: link start window', () => {
  it.skipIf(!databaseUrl)('persists startsAt/notStartedUrl and classifies the window', async () => {
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const code = `sw${Date.now().toString(36)}`
    const start = new Date(Date.now() + 3600_000)
    try {
      await db.url.create({ data: { shortCode: code, originalUrl: 'https://example.com', startsAt: start, notStartedUrl: 'https://example.com/teaser', expiresAt: new Date(start.getTime() + 3600_000) } })
      const row = await db.url.findUniqueOrThrow({ where: { shortCode: code } })
      expect(row.notStartedUrl).toBe('https://example.com/teaser')
      expect(linkWindowState(row)).toBe('scheduled')
      expect(linkWindowState(row, new Date(start.getTime() + 1000))).toBe('live')
      expect(linkWindowState(row, new Date(start.getTime() + 7200_000))).toBe('expired')
    } finally {
      await db.url.deleteMany({ where: { shortCode: code } })
      await db.$disconnect()
    }
  })
})
