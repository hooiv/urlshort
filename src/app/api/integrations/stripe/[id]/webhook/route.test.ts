import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const prismaMock = vi.hoisted(() => ({ stripeIntegration: { findUnique: vi.fn(), update: vi.fn() } }))
const processMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/stripe-attribution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stripe-attribution')>()),
  processStripeEvent: processMock,
}))

import { POST } from './route'
import { signStripePayload } from '@/lib/stripe-attribution'

const ID = 'clintegration0001'
const SECRET = 'whsec_route_test_secret_value'
const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', livemode: true, data: { object: {} } })
const call = (headers: Record<string, string>, payload = body, id = ID) =>
  POST(new NextRequest(`https://ql.test/api/integrations/stripe/${id}/webhook`, { method: 'POST', body: payload, headers }), { params: Promise.resolve({ id }) })

describe('POST /api/integrations/stripe/:id/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.stripeIntegration.findUnique.mockResolvedValue({ id: ID, userId: 'u', signingSecret: SECRET, goalEventKey: 'purchase', trackRecurring: true, isActive: true, livemode: null })
    prismaMock.stripeIntegration.update.mockResolvedValue({})
    processMock.mockResolvedValue({ outcome: 'recorded', conversionId: 'conv_1' })
  })

  it('processes a correctly signed event and records livemode', async () => {
    const res = await call({ 'stripe-signature': signStripePayload(body, SECRET) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, outcome: 'recorded', conversionId: 'conv_1' })
    expect(prismaMock.stripeIntegration.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ livemode: true }) }))
  })

  it('rejects bad signatures before parsing the event', async () => {
    const res = await call({ 'stripe-signature': signStripePayload(body, 'whsec_wrong_secret_value') })
    expect(res.status).toBe(400)
    expect(processMock).not.toHaveBeenCalled()
  })

  it('hides unknown, paused and unconfigured integrations behind 404', async () => {
    prismaMock.stripeIntegration.findUnique.mockResolvedValueOnce(null)
    expect((await call({})).status).toBe(404)
    prismaMock.stripeIntegration.findUnique.mockResolvedValueOnce({ isActive: false, signingSecret: SECRET })
    expect((await call({})).status).toBe(404)
    prismaMock.stripeIntegration.findUnique.mockResolvedValueOnce({ isActive: true, signingSecret: '' })
    expect((await call({})).status).toBe(404)
    expect((await call({}, body, '../etc')).status).toBe(404)
  })

  it('asks Stripe to retry when the workspace is over quota', async () => {
    processMock.mockResolvedValueOnce({ outcome: 'quota_exceeded' })
    const res = await call({ 'stripe-signature': signStripePayload(body, SECRET) })
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('3600')
  })

  it('refuses oversized payloads', async () => {
    const big = 'x'.repeat(600 * 1024)
    expect((await call({ 'stripe-signature': 't=1,v1=' + '0'.repeat(64) }, big)).status).toBe(413)
  })
})
