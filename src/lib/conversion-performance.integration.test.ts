import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: conversion performance', () => {
  it.skipIf(!databaseUrl)('counts conversions, rate, revenue per currency, honours viewer scope', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getConversionPerformance } = await import('./conversion-performance')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `cv-${tag}` } })
    const viewer = await db.user.create({ data: { email: `cv-${tag}@example.com`, password: 'x' } })
    const now = new Date()
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
    try {
      const secret = await db.folder.create({ data: { workspaceId: ws.id, name: 'Secret', restricted: true } })
      const open = await db.url.create({ data: { shortCode: `o${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id } })
      const hidden = await db.url.create({ data: { shortCode: `h${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, folderId: secret.id } })
      const g1 = await db.goal.create({ data: { urlId: open.id, name: 'Buy', eventKey: 'buy' } })
      const g2 = await db.goal.create({ data: { urlId: hidden.id, name: 'Buy', eventKey: 'buy' } })
      await db.clickEvent.createMany({ data: [
        { urlId: open.id, trafficType: 'human', createdAt: ago(1) },
        { urlId: open.id, trafficType: 'human', createdAt: ago(2) },
        { urlId: open.id, trafficType: 'human', createdAt: ago(3) },
        { urlId: open.id, trafficType: 'human', createdAt: ago(4) },
        { urlId: open.id, trafficType: 'bot', createdAt: ago(1) },
      ] })
      await db.conversionEvent.createMany({ data: [
        { urlId: open.id, goalId: g1.id, valueCents: 1000, currency: 'usd', createdAt: ago(1) },
        { urlId: open.id, goalId: g1.id, valueCents: 500, currency: 'USD', createdAt: ago(2) },
        { urlId: open.id, goalId: g1.id, valueCents: 700, currency: 'EUR', createdAt: ago(3) },
        { urlId: open.id, goalId: g1.id, createdAt: ago(10) },
        { urlId: hidden.id, goalId: g2.id, createdAt: ago(1) },
      ] })
      const admin = await getConversionPerformance(ws.id, undefined, 7, now)
      const row = admin.links.find((l) => l.shortCode === open.shortCode)
      expect(row).toMatchObject({ clicks: 4, conversions: 3, previousConversions: 1, conversionRatePct: 75, changePct: 200 })
      expect(row?.revenue).toEqual([{ currency: 'USD', cents: 1500 }, { currency: 'EUR', cents: 700 }])
      expect(admin.links.some((l) => l.shortCode === hidden.shortCode)).toBe(true)
      const limited = await getConversionPerformance(ws.id, { userId: viewer.id }, 7, now)
      expect(limited.links.some((l) => l.shortCode === hidden.shortCode)).toBe(false)
    } finally {
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.deleteMany({ where: { id: ws.id } })
      await db.user.deleteMany({ where: { id: viewer.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
