import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe.skipIf(!databaseUrl)('daily click cap (real Postgres)', () => {
  let prisma: typeof import('./prisma').prisma
  let reserveDailyClick: typeof import('./daily-click-cap').reserveDailyClick
  let id = ''
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    ;({ prisma } = await import('./prisma'))
    ;({ reserveDailyClick } = await import('./daily-click-cap'))
    const u = await prisma.url.create({ data: { originalUrl: 'https://example.com/cap', shortCode: `cap${Date.now().toString(36)}`, dailyClickCap: 3 } })
    id = u.id
  })
  afterAll(async () => {
    if (id) await prisma.url.delete({ where: { id } }).catch(() => {})
    await prisma.$disconnect()
  })
  it('admits exactly cap clicks concurrently, then rolls over next day', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveDailyClick(prisma, id, 3, '2026-10-14')))
    expect(results.filter(Boolean)).toHaveLength(3)
    expect(await reserveDailyClick(prisma, id, 3, '2026-10-14')).toBe(false)
    expect(await reserveDailyClick(prisma, id, 3, '2026-10-15')).toBe(true)
    const row = await prisma.url.findUniqueOrThrow({ where: { id } })
    expect(row.dailyClicksReserved).toBe(1)
    expect(row.dailyClicksDate).toBe('2026-10-15')
  })
})
