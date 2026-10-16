import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'

/** Real-Postgres check: concurrent requests sharing an Idempotency-Key run the work once. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: idempotency claim', () => {
  it.skipIf(!databaseUrl)('lets exactly one of N concurrent same-key requests proceed, then replays', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getIdempotentResponse, storeIdempotentResponse } = await import('./idempotency')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `i-${tag}` } })
    const req = () => new NextRequest('http://localhost/api/shorten', { method: 'POST', headers: { 'idempotency-key': `key-${tag}` } })
    try {
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => getIdempotentResponse(req(), ws.id, { u: 1 })))
      const won = results.filter((r) => r.status === 'fulfilled')
      expect(won).toHaveLength(1)
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(7)
      const claim = (won[0] as PromiseFulfilledResult<{ keyHash: string; requestHash: string }>).value
      await storeIdempotentResponse({ workspaceId: ws.id, keyHash: claim.keyHash, requestHash: claim.requestHash, method: 'POST', path: '/api/shorten', status: 201, body: { ok: true } })
      const replay = await getIdempotentResponse(req(), ws.id, { u: 1 })
      expect(replay?.existing?.responseStatus).toBe(201)
    } finally {
      await db.workspace.delete({ where: { id: ws.id } })
      await db.$disconnect()
    }
  })
  it.skipIf(!databaseUrl)('releases a pending claim so a retry runs at once, but never deletes a stored response', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getIdempotentResponse, storeIdempotentResponse, releaseIdempotencyClaim } = await import('./idempotency')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `r-${tag}` } })
    const req = () => new NextRequest('http://localhost/api/shorten', { method: 'POST', headers: { 'idempotency-key': `key-${tag}` } })
    try {
      const first = await getIdempotentResponse(req(), ws.id, { u: 1 })
      await expect(getIdempotentResponse(req(), ws.id, { u: 1 })).rejects.toThrow(/in progress/)
      await releaseIdempotencyClaim(ws.id, first!.keyHash)
      const retry = await getIdempotentResponse(req(), ws.id, { u: 1 })
      expect(retry?.existing).toBeNull()
      await storeIdempotentResponse({ workspaceId: ws.id, keyHash: retry!.keyHash, requestHash: retry!.requestHash, method: 'POST', path: '/api/shorten', status: 201, body: { ok: 1 } })
      await releaseIdempotencyClaim(ws.id, retry!.keyHash)
      expect((await getIdempotentResponse(req(), ws.id, { u: 1 }))?.existing?.responseStatus).toBe(201)
    } finally {
      await db.workspace.delete({ where: { id: ws.id } })
      await db.$disconnect()
    }
  })
})
