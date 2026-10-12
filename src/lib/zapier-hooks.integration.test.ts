import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: zapier polling', () => {
  it.skipIf(!databaseUrl)('returns newest first and hides restricted-folder links, bots and deleted links', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { pollNewLinks, pollNewClicks, pollNewSales } = await import('./zapier-hooks')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [admin, editor] = await Promise.all(['a', 'e'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    const ws = await db.workspace.create({ data: { name: tag, slug: `z-${tag}`, members: { create: [{ userId: admin.id, role: 'admin' }, { userId: editor.id, role: 'editor' }] } } })
    try {
      const secret = await db.folder.create({ data: { workspaceId: ws.id, name: 'S', restricted: true } })
      const mk = (c: string, extra: object = {}) => db.url.create({ data: { shortCode: `${c}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, ...extra } })
      const open = await mk('o')
      await new Promise((r) => setTimeout(r, 5))
      const hidden = await mk('h', { folderId: secret.id })
      const gone = await mk('g', { deletedAt: new Date() })
      const ids = async (u: string) => (await pollNewLinks(u, 50)).map((l) => l.id)
      expect(await ids(admin.id)).toEqual([hidden.id, open.id])
      expect(await ids(editor.id)).toEqual([open.id])
      expect(await ids(editor.id)).not.toContain(gone.id)

      await db.clickEvent.create({ data: { urlId: open.id, trafficType: 'human', country: 'IN', ip: '9.9.9.9' } })
      await db.clickEvent.create({ data: { urlId: open.id, trafficType: 'bot' } })
      await db.clickEvent.create({ data: { urlId: hidden.id, trafficType: 'human' } })
      const clicks = await pollNewClicks(editor.id, 50)
      expect(clicks).toHaveLength(1)
      expect(clicks[0]).not.toHaveProperty('ip')

      const goal = await db.goal.create({ data: { urlId: open.id, name: 'Purchase', eventKey: 'purchase' } })
      await db.conversionEvent.create({ data: { urlId: open.id, goalId: goal.id, valueCents: 1200, currency: 'usd' } })
      await db.conversionEvent.create({ data: { urlId: open.id, goalId: goal.id } })
      const sales = await pollNewSales(editor.id, 50)
      expect(sales).toHaveLength(1)
      expect(sales[0].valueCents).toBe(1200)
    } finally {
      await db.workspace.delete({ where: { id: ws.id } }).catch(() => {})
      await db.user.deleteMany({ where: { id: { in: [admin.id, editor.id] } } })
      await db.$disconnect()
    }
  }, 30_000)
})
