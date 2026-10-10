import { describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'

/** Real-Postgres check: creating a link with utmTemplateId stamps the workspace template onto the destination. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL
let currentUserId = ''
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), getCurrentUser: async () => ({ id: currentUserId }) }))
vi.mock('@/lib/destination-health', async (orig) => ({ ...(await orig<typeof import('@/lib/destination-health')>()), assertDestinationSafeForStorage: async () => undefined }))

describe('real database: UTM template on link creation', () => {
  it.skipIf(!databaseUrl)('applies a workspace template without overwriting existing utm params and rejects foreign templates', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { POST } = await import('./route')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await db.user.create({ data: { email: `utm-${tag}@example.com`, password: 'x' } })
    const [ws, other] = await Promise.all([
      db.workspace.create({ data: { name: tag, slug: `u-${tag}`, members: { create: [{ userId: user.id, role: 'editor' }] } } }),
      db.workspace.create({ data: { name: `o${tag}`, slug: `uo-${tag}` } }),
    ])
    try {
      currentUserId = user.id
      const mine = await db.utmTemplate.create({ data: { workspaceId: ws.id, name: 'Newsletter', source: 'news', medium: 'email', campaign: 'oct' } })
      const foreign = await db.utmTemplate.create({ data: { workspaceId: other.id, name: 'Theirs', source: 'x' } })
      const post = (json: unknown) => POST(new NextRequest('http://localhost/api/shorten', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(json) }))

      const ok = await post({ url: 'https://example.com/p?utm_source=keep', workspaceId: ws.id, utmTemplateId: mine.id })
      expect(ok.status).toBe(201)
      const row = await db.url.findFirstOrThrow({ where: { shortCode: (await ok.json()).shortCode } })
      const u = new URL(row.originalUrl)
      expect(u.searchParams.get('utm_source')).toBe('keep')
      expect(u.searchParams.get('utm_medium')).toBe('email')
      expect(u.searchParams.get('utm_campaign')).toBe('oct')

      expect((await post({ url: 'https://example.com', workspaceId: ws.id, utmTemplateId: foreign.id })).status).toBe(404)
      expect((await post({ url: 'https://example.com', workspaceId: ws.id, utmTemplateId: 42 })).status).toBe(400)
    } finally {
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.utmTemplate.deleteMany({ where: { workspaceId: { in: [ws.id, other.id] } } })
      await db.workspace.deleteMany({ where: { id: { in: [ws.id, other.id] } } })
      await db.user.delete({ where: { id: user.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
