import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe.skipIf(!databaseUrl)('saved views (real Postgres)', () => {
  let lib: typeof import('./saved-views')
  let prisma: typeof import('./prisma').prisma
  let userA = ''
  let userB = ''

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    lib = await import('./saved-views')
    prisma = (await import('./prisma')).prisma
    const sfx = Date.now().toString(36)
    userA = (await prisma.user.create({ data: { email: `sv-a-${sfx}@t.dev`, password: 'x' } })).id
    userB = (await prisma.user.create({ data: { email: `sv-b-${sfx}@t.dev`, password: 'x' } })).id
  })
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } })
    await prisma.$disconnect()
  })

  it('creates, overwrites by name, isolates users and deletes', async () => {
    const a = await lib.upsertSavedView(userA, { name: 'Promos', filters: { tags: ['promo'] } })
    expect(a.created).toBe(true)
    const b = await lib.upsertSavedView(userA, { name: 'Promos', filters: { status: 'active' } })
    expect(b.created).toBe(false)
    expect(b.view.id).toBe(a.view.id)
    expect(b.view.filters).toEqual({ status: 'active' })
    expect(await lib.listSavedViews(userB)).toHaveLength(0)
    await expect(lib.deleteSavedView(userB, a.view.id)).rejects.toMatchObject({ status: 404 })
    await lib.deleteSavedView(userA, a.view.id)
    expect(await lib.listSavedViews(userA)).toHaveLength(0)
  })

  it('caps views per user', async () => {
    for (let i = 0; i < lib.MAX_SAVED_VIEWS; i++) await lib.upsertSavedView(userA, { name: `v${i}`, filters: {} })
    await expect(lib.upsertSavedView(userA, { name: 'one-too-many', filters: {} })).rejects.toMatchObject({ status: 422 })
    await lib.upsertSavedView(userA, { name: 'v0', filters: { q: 'ok' } })
  })
})
