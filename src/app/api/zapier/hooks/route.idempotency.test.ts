import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ resolve: vi.fn(), create: vi.fn(), member: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn() }))
vi.mock('@/lib/request-actor', () => ({ WEBHOOK_SCOPES: [], resolveActor: m.resolve }))
vi.mock('../../webhooks/route', () => ({ POST: m.create }))
vi.mock('@/lib/prisma', () => ({ prisma: { membership: { findFirst: m.member } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

import { POST } from './route'

const req = (headers: Record<string, string> = {}) => new NextRequest('http://x/api/zapier/hooks', { method: 'POST', body: JSON.stringify({ target_url: 'https://hooks.zapier.com/x', event: 'new_click' }), headers })
const key = { 'idempotency-key': 'key-12345678' }

describe('POST /api/zapier/hooks idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.resolve.mockResolvedValue({ actor: { kind: 'session', userId: 'u1' } })
    m.member.mockResolvedValue({ workspaceId: 'w1' })
    m.create.mockResolvedValue(NextResponse.json({ id: 'wh1', secret: 's' }, { status: 201 }))
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
  })
  it('stores the minimal response (no secret) when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    const res = await POST(req(key))
    expect(res.status).toBe(201)
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(m.storeIdem.mock.calls[0][0].body)).not.toContain('secret')
  })
  it('replays without subscribing again', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"id":"wh1"}', responseStatus: 201 } })
    const res = await POST(req(key))
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.create).not.toHaveBeenCalled()
  })
  it('releases the claim when creation fails', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.create.mockResolvedValue(NextResponse.json({ error: 'bad url' }, { status: 400 }))
    expect((await POST(req(key))).status).toBe(400)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('skips idempotency without a key', async () => {
    expect((await POST(req())).status).toBe(201)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
