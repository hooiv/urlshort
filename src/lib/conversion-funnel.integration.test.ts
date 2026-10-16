import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres funnel check. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: conversion funnel', () => {
  it.skipIf(!databaseUrl)('counts only clicks that reached every earlier step', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getLinkFunnel } = await import('./conversion-funnel')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
    const url = await db.url.create({ data: { shortCode: `fn${tag}`.slice(0, 40), originalUrl: 'https://example.com' } })
    try {
      const lead = await db.goal.create({ data: { urlId: url.id, name: 'Lead', eventKey: 'lead' } })
      const sale = await db.goal.create({ data: { urlId: url.id, name: 'Sale', eventKey: 'sale' } })
      const clicks = await Promise.all([1, 2, 3, 4].map((d) => db.clickEvent.create({ data: { urlId: url.id, trafficType: 'human', createdAt: ago(d) } })))
      await db.clickEvent.create({ data: { urlId: url.id, trafficType: 'bot', createdAt: ago(1) } })
      const conv = (click: string, goalId: string) => ({ urlId: url.id, goalId, clickEventId: click, createdAt: ago(0.5) })
      await db.conversionEvent.createMany({ data: [
        conv(clicks[0].id, lead.id), conv(clicks[1].id, lead.id), conv(clicks[2].id, lead.id),
        conv(clicks[0].id, sale.id), conv(clicks[3].id, sale.id), // clicks[3] never became a lead: excluded
      ] })
      const f = await getLinkFunnel(url.id, ['lead', 'sale'], 7, now)
      expect(f.clicks).toBe(4)
      expect(f.steps.map((s) => s.count)).toEqual([3, 1])
      expect(f.steps[1]).toMatchObject({ stepRatePct: 33.3, overallRatePct: 25, dropOff: 2 })
      const empty = await getLinkFunnel(url.id, ['missing', 'sale'], 7, now)
      expect(empty.steps.map((s) => s.count)).toEqual([0, 0])
    } finally {
      await db.url.delete({ where: { id: url.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
