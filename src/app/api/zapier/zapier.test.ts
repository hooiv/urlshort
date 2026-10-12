import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const resolveActor = vi.fn()
const createWebhook = vi.fn()
const deleteWebhook = vi.fn()
const poll = vi.fn()
vi.mock('@/lib/request-actor', () => ({ LINK_READ_SCOPES: ['links:read'], WEBHOOK_SCOPES: ['webhooks:write'], ANALYTICS_READ_SCOPES: ['analytics:read'], resolveActor: (...a: unknown[]) => resolveActor(...a) }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn(async () => ({ id: 'u1', email: 'a@b.c', name: null })) } } }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }))
vi.mock('../webhooks/route', () => ({ POST: (...a: unknown[]) => createWebhook(...a) }))
vi.mock('../webhooks/[id]/route', () => ({ DELETE: (...a: unknown[]) => deleteWebhook(...a) }))
vi.mock('@/lib/zapier-hooks', async (orig) => ({ ...(await orig<typeof import('@/lib/zapier-hooks')>()), pollTrigger: (...a: unknown[]) => poll(...a) }))

import { POST as subscribe } from './hooks/route'
import { DELETE as unsubscribe } from './hooks/[id]/route'
import { GET as trigger } from './triggers/[trigger]/route'
import { GET as me } from './me/route'

const sub = (body: unknown) => new NextRequest('http://x/api/zapier/hooks', { method: 'POST', headers: { authorization: 'Bearer k' }, body: JSON.stringify(body) })

describe('/api/zapier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveActor.mockResolvedValue({ actor: { userId: 'u1' } })
  })

  it('subscribes by forwarding a webhook create with the mapped event and returns only the id', async () => {
    createWebhook.mockResolvedValue(new Response(JSON.stringify({ id: 'w1', secret: 'shh' }), { status: 201 }))
    const res = await subscribe(sub({ target_url: 'https://hooks.zapier.com/x', event: 'new_sale', tags: ['a'] }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'w1', event: 'new_sale' })
    const forwarded = createWebhook.mock.calls[0][0] as NextRequest
    expect(await forwarded.json()).toEqual({ url: 'https://hooks.zapier.com/x', events: ['conversion.recorded'], tags: ['a'] })
    expect(forwarded.headers.get('authorization')).toBe('Bearer k')
  })

  it('rejects unknown events and missing fields before creating anything', async () => {
    expect((await subscribe(sub({ target_url: 'https://x.y', event: 'nope' }))).status).toBe(400)
    expect((await subscribe(sub({ event: 'new_link' }))).status).toBe(400)
    expect(createWebhook).not.toHaveBeenCalled()
  })

  it('passes through downstream validation errors', async () => {
    createWebhook.mockResolvedValue(new Response(JSON.stringify({ error: 'Webhook URLs must use HTTPS' }), { status: 400 }))
    const res = await subscribe(sub({ target_url: 'http://x.y', event: 'new_link' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/HTTPS/)
  })

  it('requires auth on every route', async () => {
    resolveActor.mockResolvedValue({ actor: null, status: 403, error: 'API key needs one of these scopes' })
    expect((await subscribe(sub({ target_url: 'https://x.y', event: 'new_link' }))).status).toBe(403)
    expect((await unsubscribe(new NextRequest('http://x/api/zapier/hooks/w1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'w1' }) })).status).toBe(403)
    expect((await trigger(new NextRequest('http://x/api/zapier/triggers/new_link'), { params: Promise.resolve({ trigger: 'new_link' }) })).status).toBe(403)
    expect((await me(new NextRequest('http://x/api/zapier/me'))).status).toBe(403)
    expect(deleteWebhook).not.toHaveBeenCalled()
  })

  it('unsubscribes through the webhook delete handler', async () => {
    deleteWebhook.mockResolvedValue(new Response(null, { status: 204 }))
    const res = await unsubscribe(new NextRequest('http://x/api/zapier/hooks/w1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'w1' }) })
    expect(res.status).toBe(204)
  })

  it('polls with the scope for the trigger and clamps the limit', async () => {
    poll.mockResolvedValue([{ id: 'a' }])
    const res = await trigger(new NextRequest('http://x/api/zapier/triggers/new_click?limit=500'), { params: Promise.resolve({ trigger: 'new_click' }) })
    expect(await res.json()).toEqual([{ id: 'a' }])
    expect(resolveActor).toHaveBeenCalledWith(expect.anything(), ['analytics:read'])
    expect(poll).toHaveBeenCalledWith('new_click', 'u1', 100)
    expect((await trigger(new NextRequest('http://x/api/zapier/triggers/bogus'), { params: Promise.resolve({ trigger: 'bogus' }) })).status).toBe(404)
  })
})
