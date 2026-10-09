import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres checks for folder visibility. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: link folders', () => {
  it.skipIf(!databaseUrl)('hides restricted folders everywhere a member could list or measure links', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { visibleUrlWhere } = await import('./folders')
    const { getRoleForUserId } = await import('./authorization')
    const { getAggregatedAnalytics } = await import('./aggregate-analytics')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const users = await Promise.all(['admin', 'editor', 'granted'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    const [admin, editor, granted] = users
    const workspace = await db.workspace.create({ data: { name: tag, slug: `f-${tag}`, members: { create: [{ userId: admin.id, role: 'admin' }, { userId: editor.id, role: 'editor' }, { userId: granted.id, role: 'editor' }] } } })
    try {
      const secret = await db.folder.create({ data: { workspaceId: workspace.id, name: 'Secret', restricted: true, access: { create: { userId: granted.id, role: 'viewer' } } } })
      const open = await db.folder.create({ data: { workspaceId: workspace.id, name: 'Open' } })
      const mk = (code: string, folderId: string | null) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: workspace.id, folderId } })
      const [hidden, visible, loose] = await Promise.all([mk('h', secret.id), mk('o', open.id), mk('n', null)])
      const day = new Date().toISOString().slice(0, 10)
      await db.clickDaily.createMany({ data: [hidden, visible, loose].map((u) => ({ urlId: u.id, dateKey: day, clicks: 10 })) })

      const codesFor = async (userId: string) => (await db.url.findMany({ where: { AND: [visibleUrlWhere(userId), { workspaceId: workspace.id }] }, select: { id: true } })).map((u) => u.id).sort()
      expect(await codesFor(admin.id)).toEqual([hidden.id, visible.id, loose.id].sort())
      expect(await codesFor(editor.id)).toEqual([visible.id, loose.id].sort())
      expect(await codesFor(granted.id)).toEqual([hidden.id, visible.id, loose.id].sort())

      expect(await getRoleForUserId(editor.id, hidden)).toBeNull()
      expect(await getRoleForUserId(granted.id, hidden)).toBe('viewer')
      expect(await getRoleForUserId(editor.id, visible)).toBe('editor')

      const window = { from: day, to: day, days: 1 }
      const total = async (viewer?: { userId: string }, folderId?: string | null) => (await getAggregatedAnalytics({ kind: 'workspace', workspaceId: workspace.id, viewer, folderId }, window)).totals.clicks
      expect(await total()).toBe(30)
      expect(await total({ userId: editor.id })).toBe(20)
      expect(await total({ userId: granted.id })).toBe(30)
      expect(await total(undefined, null)).toBe(10)
      expect(await total(undefined, secret.id)).toBe(10)

      // A workspace webhook scoped to the secret folder fires for its links only.
      const { dispatchWebhooksForUrls } = await import('./webhooks')
      const hook = await db.webhookEndpoint.create({ data: { workspaceId: workspace.id, url: 'https://hooks.example.com/x', secret: 's', events: ['link.clicked'], linkScope: 'folders', folderIdFilter: [secret.id] } })
      const sent = await dispatchWebhooksForUrls('link.clicked', [hidden, visible, loose].map((u) => ({ urlId: u.id, payload: { id: u.id } })))
      expect(sent.enqueued).toBe(1)
      expect(JSON.parse((await db.webhookDelivery.findFirstOrThrow({ where: { endpointId: hook.id } })).payload).id).toBe(hidden.id)
      await db.$executeRaw`UPDATE "webhook_endpoints" SET "folderIdFilter" = array_remove("folderIdFilter", ${secret.id}) WHERE "workspaceId" = ${workspace.id} AND ${secret.id} = ANY("folderIdFilter")`
      expect((await db.webhookEndpoint.findUniqueOrThrow({ where: { id: hook.id } })).folderIdFilter).toEqual([])
    } finally {
      await db.url.deleteMany({ where: { workspaceId: workspace.id } })
      await db.workspace.delete({ where: { id: workspace.id } })
      await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
      await db.$disconnect()
    }
  }, 60_000)
})
