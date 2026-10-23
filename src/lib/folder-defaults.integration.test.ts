import { describe, expect, it } from 'vitest'

const databaseUrl = process.env.SOAK_DATABASE_URL
describe.skipIf(!databaseUrl)('folder defaults (real Postgres)', () => {
  it('persists default tags and template id on a folder', async () => {
    process.env.DATABASE_URL = databaseUrl
    const { prisma } = await import('./prisma')
    const ws = await prisma.workspace.create({ data: { name: 'fd-ws', slug: `fd-${Date.now()}` } })
    try {
      const f = await prisma.folder.create({ data: { workspaceId: ws.id, name: 'Promo', defaultTags: ['promo', 'q4'] } })
      const got = await prisma.folder.findUniqueOrThrow({ where: { id: f.id } })
      expect(got.defaultTags).toEqual(['promo', 'q4'])
      expect(got.defaultUtmTemplateId).toBeNull()
      const bare = await prisma.folder.create({ data: { workspaceId: ws.id, name: 'Bare' } })
      expect(bare.defaultTags).toEqual([])
    } finally {
      await prisma.workspace.delete({ where: { id: ws.id } })
    }
  })
})
