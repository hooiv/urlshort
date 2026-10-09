import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

const prismaMock = vi.hoisted(() => ({
  stripeEventReceipt: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  stripeCustomerAttribution: { findUnique: vi.fn(), upsert: vi.fn() },
  url: { findUnique: vi.fn() },
  membership: { findUnique: vi.fn() },
  clickEvent: { findFirst: vi.fn() },
  goal: { upsert: vi.fn() },
  conversionEvent: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  conversionDaily: { upsert: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}))
const verifyMock = vi.hoisted(() => vi.fn())
const reserveMock = vi.hoisted(() => vi.fn())
const dispatchMock = vi.hoisted(() => vi.fn())

vi.mock('./prisma', () => ({ prisma: prismaMock }))
vi.mock('./attribution', () => ({ verifyAttributionToken: verifyMock }))
vi.mock('./tenant-usage', () => ({ reserveUsageInTransaction: reserveMock }))
vi.mock('./webhooks', () => ({ dispatchWebhooksForUrl: dispatchMock }))
vi.mock('./privacy-ingestion', () => ({
  getPrivacyPolicy: vi.fn(async () => ({ hashVisitor: true, aggregateOnly: false })),
  hashWithWorkspace: (value: string, ws: string) => `${ws}:${value}`,
}))

import {
  normalizeSaleValue,
  parseStripeEvent,
  processStripeEvent,
  saleFromCheckoutSession,
  saleFromInvoice,
  signStripePayload,
  verifyStripeSignature,
  isValidStripeSigningSecret,
  type StripeEvent,
} from './stripe-attribution'

const SECRET = 'whsec_test_0123456789abcdef'
const integration = { id: 'int_1', userId: 'user_a', goalEventKey: 'purchase', trackRecurring: true }

describe('verifyStripeSignature', () => {
  const body = JSON.stringify({ id: 'evt_1' })
  const now = 1_800_000_000

  it('accepts a correctly signed, fresh payload', () => {
    expect(verifyStripeSignature(body, signStripePayload(body, SECRET, now), SECRET, { nowSeconds: now + 10 })).toEqual({ ok: true, timestamp: now })
  })

  it('accepts any of several v1 signatures (secret rolling)', () => {
    const good = signStripePayload(body, SECRET, now).split(',')[1]
    const header = `t=${now},v1=${'0'.repeat(64)},${good}`
    expect(verifyStripeSignature(body, header, SECRET, { nowSeconds: now }).ok).toBe(true)
  })

  it('rejects tampered bodies, wrong secrets, stale timestamps and junk', () => {
    const header = signStripePayload(body, SECRET, now)
    expect(verifyStripeSignature(body + ' ', header, SECRET, { nowSeconds: now })).toEqual({ ok: false, reason: 'mismatch' })
    expect(verifyStripeSignature(body, header, 'whsec_other_secret_value', { nowSeconds: now })).toEqual({ ok: false, reason: 'mismatch' })
    expect(verifyStripeSignature(body, header, SECRET, { nowSeconds: now + 301 })).toEqual({ ok: false, reason: 'expired' })
    expect(verifyStripeSignature(body, 't=abc,v1=zz', SECRET)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyStripeSignature(body, null, SECRET)).toEqual({ ok: false, reason: 'missing' })
  })
})

describe('event parsing and extraction', () => {
  it('validates signing secrets and event envelopes', () => {
    expect(isValidStripeSigningSecret(SECRET)).toBe(true)
    expect(isValidStripeSigningSecret('sk_live_123')).toBe(false)
    expect(parseStripeEvent('{"id":"evt_1","type":"x","data":{"object":{}}}')?.id).toBe('evt_1')
    expect(parseStripeEvent('{"id":"nope","type":"x","data":{"object":{}}}')).toBeNull()
    expect(parseStripeEvent('not json')).toBeNull()
  })

  it('reads checkout sessions, skipping unpaid async payments', () => {
    expect(saleFromCheckoutSession({ id: 'cs_1', payment_status: 'unpaid' })).toBe('unpaid')
    expect(saleFromCheckoutSession({
      id: 'cs_1', payment_status: 'paid', amount_total: 4900, currency: 'usd',
      customer: { id: 'cus_1' }, invoice: 'in_1', payment_intent: 'pi_1', metadata: { ql_attribution: ' v1.tok.sig ' },
    })).toEqual({ saleKey: 'checkout:cs_1', token: 'v1.tok.sig', customerId: 'cus_1', amountCents: 4900, currency: 'usd', source: 'checkout', coversInvoiceId: 'in_1', paymentIntentId: 'pi_1' })
  })

  it('finds tokens on invoices across Stripe API versions', () => {
    expect(saleFromInvoice({ id: 'in_1', customer: 'cus_1', amount_paid: 900, currency: 'eur', parent: { subscription_details: { metadata: { quicklink_attribution: 'v1.a.b' } } } }).token).toBe('v1.a.b')
    expect(saleFromInvoice({ id: 'in_2', subscription_details: { metadata: { ql_attribution: 'v1.c.d' } } }).token).toBe('v1.c.d')
  })

  it('normalises amounts and currencies', () => {
    expect(normalizeSaleValue(4900, 'usd')).toEqual({ valueCents: 4900, currency: 'USD' })
    expect(normalizeSaleValue(9_999_999_999, 'usd').valueCents).toBe(100_000_000)
    expect(normalizeSaleValue(-5, 'xx')).toEqual({ valueCents: null, currency: null })
  })
})

const checkoutEvent = (over: Record<string, unknown> = {}, id = 'evt_checkout'): StripeEvent => ({
  id,
  type: 'checkout.session.completed',
  livemode: false,
  data: { object: { id: 'cs_1', payment_status: 'paid', amount_total: 4900, currency: 'usd', customer: 'cus_1', metadata: { ql_attribution: 'v1.tok.sig' }, ...over } },
})

describe('processStripeEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock))
    prismaMock.stripeEventReceipt.findUnique.mockResolvedValue(null)
    prismaMock.stripeEventReceipt.create.mockResolvedValue({ id: 'rcpt_sale' })
    prismaMock.stripeEventReceipt.update.mockResolvedValue({})
    prismaMock.stripeEventReceipt.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.stripeCustomerAttribution.findUnique.mockResolvedValue(null)
    prismaMock.url.findUnique.mockResolvedValue({ id: 'url_1', userId: 'user_a', workspaceId: 'ws_1' })
    prismaMock.membership.findUnique.mockResolvedValue(null)
    prismaMock.clickEvent.findFirst.mockResolvedValue({ id: 'click_1', ruleId: 'rule_1' })
    prismaMock.goal.upsert.mockResolvedValue({ id: 'goal_1', enabled: true })
    prismaMock.conversionEvent.create.mockResolvedValue({ id: 'conv_1' })
    reserveMock.mockResolvedValue({ allowed: true })
    verifyMock.mockReturnValue({ urlId: 'url_1', shortCode: 'abc', clickEventId: 'click_1', visitorIdHash: 'vis', issuedAt: Date.now() })
  })

  it('records an attributed checkout with value, goal auto-creation and a customer mapping', async () => {
    const result = await processStripeEvent(integration, checkoutEvent({ invoice: 'in_first' }))
    expect(result).toEqual({ outcome: 'recorded', conversionId: 'conv_1' })
    expect(prismaMock.goal.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ urlId: 'url_1', eventKey: 'purchase' }) }))
    expect(prismaMock.conversionEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ urlId: 'url_1', clickEventId: 'click_1', ruleId: 'rule_1', valueCents: 4900, currency: 'USD', visitorIdHash: 'ws_1:vis' }),
    }))
    const receiptKeys = prismaMock.stripeEventReceipt.create.mock.calls.map(([arg]) => arg.data.stripeEventId)
    expect(receiptKeys).toEqual(['checkout:cs_1', 'invoice:in_first', 'evt_checkout'])
    expect(prismaMock.stripeEventReceipt.update).toHaveBeenCalledWith({ where: { id: 'rcpt_sale' }, data: { conversionId: 'conv_1' } })
    expect(prismaMock.stripeCustomerAttribution.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ stripeCustomerId: 'cus_1', urlId: 'url_1' }), update: {} }))
    expect(reserveMock).toHaveBeenCalledWith(prismaMock, 'ws_1', 'conversions', 1n)
    expect(dispatchMock).toHaveBeenCalledWith('url_1', 'conversion.recorded', expect.objectContaining({ source: 'stripe', valueCents: 4900 }))
  })

  it('short-circuits replays of an event it already processed', async () => {
    prismaMock.stripeEventReceipt.findUnique.mockResolvedValueOnce({ outcome: 'recorded', conversionId: 'conv_1' })
    expect(await processStripeEvent(integration, checkoutEvent())).toEqual({ outcome: 'duplicate', conversionId: 'conv_1' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('treats a concurrent duplicate (unique violation) as a no-op', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }))
    expect(await processStripeEvent(integration, checkoutEvent())).toEqual({ outcome: 'duplicate' })
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it('refuses to credit links the integration owner cannot access', async () => {
    prismaMock.url.findUnique.mockResolvedValue({ id: 'url_1', userId: 'someone_else', workspaceId: 'ws_other' })
    expect((await processStripeEvent(integration, checkoutEvent())).outcome).toBe('foreign_link')
    expect(prismaMock.conversionEvent.create).not.toHaveBeenCalled()
  })

  it('allows workspace links when the owner is a member', async () => {
    prismaMock.url.findUnique.mockResolvedValue({ id: 'url_1', userId: 'teammate', workspaceId: 'ws_1' })
    prismaMock.membership.findUnique.mockResolvedValue({ id: 'm1' })
    expect((await processStripeEvent(integration, checkoutEvent())).outcome).toBe('recorded')
  })

  it('reports invalid tokens, missing attribution, unpaid sessions and zero amounts', async () => {
    verifyMock.mockReturnValueOnce(null)
    expect((await processStripeEvent(integration, checkoutEvent())).outcome).toBe('invalid_token')
    expect((await processStripeEvent(integration, checkoutEvent({ metadata: {}, customer: null }))).outcome).toBe('no_attribution')
    expect((await processStripeEvent(integration, checkoutEvent({ payment_status: 'unpaid' }))).outcome).toBe('unpaid')
    expect((await processStripeEvent(integration, checkoutEvent({ amount_total: 0 }))).outcome).toBe('zero_amount')
    expect(prismaMock.conversionEvent.create).not.toHaveBeenCalled()
  })

  it('credits renewals through the stored customer mapping', async () => {
    prismaMock.stripeCustomerAttribution.findUnique.mockResolvedValue({ urlId: 'url_1', clickEventId: 'click_1', visitorIdHash: 'ws_1:vis' })
    const event: StripeEvent = { id: 'evt_inv', type: 'invoice.paid', data: { object: { id: 'in_2', customer: 'cus_1', amount_paid: 1900, currency: 'usd' } } }
    expect((await processStripeEvent(integration, event)).outcome).toBe('recorded')
    expect(verifyMock).not.toHaveBeenCalled()
    expect(prismaMock.conversionEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ valueCents: 1900, visitorIdHash: 'ws_1:vis' }) }))
    expect(prismaMock.stripeCustomerAttribution.upsert).not.toHaveBeenCalled()
  })

  it('does not double count the first subscription invoice already covered by checkout', async () => {
    prismaMock.stripeEventReceipt.findUnique
      .mockResolvedValueOnce(null) // event id not seen
      .mockResolvedValueOnce({ conversionId: 'conv_1' }) // invoice:in_first written by the checkout
    const event: StripeEvent = { id: 'evt_inv', type: 'invoice.paid', data: { object: { id: 'in_first', customer: 'cus_1', amount_paid: 4900 } } }
    expect(await processStripeEvent(integration, event)).toEqual({ outcome: 'covered_by_checkout', conversionId: 'conv_1' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('honours trackRecurring=false', async () => {
    const event: StripeEvent = { id: 'evt_inv', type: 'invoice.paid', data: { object: { id: 'in_2', customer: 'cus_1', amount_paid: 1900 } } }
    expect((await processStripeEvent({ ...integration, trackRecurring: false }, event)).outcome).toBe('recurring_disabled')
  })

  it('leaves no receipt when over quota so Stripe retries later', async () => {
    reserveMock.mockResolvedValue({ allowed: false })
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock))
    expect((await processStripeEvent(integration, checkoutEvent())).outcome).toBe('quota_exceeded')
    expect(prismaMock.conversionEvent.create).not.toHaveBeenCalled()
  })

  it('respects a disabled goal', async () => {
    prismaMock.goal.upsert.mockResolvedValue({ id: 'goal_1', enabled: false })
    expect((await processStripeEvent(integration, checkoutEvent())).outcome).toBe('goal_disabled')
    expect(prismaMock.conversionEvent.create).not.toHaveBeenCalled()
  })

  it('acknowledges unrelated event types without work', async () => {
    const event: StripeEvent = { id: 'evt_x', type: 'customer.created', data: { object: {} } }
    expect((await processStripeEvent(integration, event)).outcome).toBe('ignored_event')
    expect(prismaMock.url.findUnique).not.toHaveBeenCalled()
  })

  it('still succeeds when webhook fan-out fails', async () => {
    dispatchMock.mockRejectedValueOnce(new Error('queue down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await processStripeEvent(integration, checkoutEvent())).outcome).toBe('recorded')
    spy.mockRestore()
  })

  describe('charge.refunded', () => {
    const refund = (amountRefunded: number, id = 'evt_refund'): StripeEvent => ({ id, type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount_refunded: amountRefunded } } })

    beforeEach(() => {
      prismaMock.stripeEventReceipt.findFirst.mockResolvedValue({ id: 'rcpt_sale', conversionId: 'conv_1', refundedCents: 0 })
      prismaMock.conversionEvent.findUnique.mockResolvedValue({ urlId: 'url_1', goalId: 'goal_1', valueCents: 4900, currency: 'USD', createdAt: new Date('2026-10-01T12:00:00Z') })
    })

    it('reverses a partial refund on the day the sale was earned', async () => {
      expect(await processStripeEvent(integration, refund(1000))).toEqual({ outcome: 'refunded', conversionId: 'conv_1' })
      expect(prismaMock.stripeEventReceipt.updateMany).toHaveBeenCalledWith({ where: { id: 'rcpt_sale', refundedCents: 0 }, data: { refundedCents: 1000 } })
      expect(prismaMock.conversionEvent.update).toHaveBeenCalledWith({ where: { id: 'conv_1' }, data: { valueCents: 3900 } })
      expect(prismaMock.conversionDaily.updateMany).toHaveBeenCalledWith({ where: { goalId: 'goal_1', dateKey: '2026-10-01' }, data: { valueCents: { decrement: 1000 } } })
      expect(dispatchMock).toHaveBeenCalledWith('url_1', 'conversion.refunded', expect.objectContaining({ refundedCents: 1000, netValueCents: 3900 }))
    })

    it('applies only the new amount of a cumulative refund', async () => {
      prismaMock.stripeEventReceipt.findFirst.mockResolvedValue({ id: 'rcpt_sale', conversionId: 'conv_1', refundedCents: 1000 })
      prismaMock.conversionEvent.findUnique.mockResolvedValue({ urlId: 'url_1', goalId: 'goal_1', valueCents: 3900, currency: 'USD', createdAt: new Date('2026-10-01T12:00:00Z') })
      await processStripeEvent(integration, refund(4900))
      expect(prismaMock.conversionEvent.update).toHaveBeenCalledWith({ where: { id: 'conv_1' }, data: { valueCents: 0 } })
    })

    it('is a no-op when the refund total was already applied or lost a race', async () => {
      prismaMock.stripeEventReceipt.findFirst.mockResolvedValue({ id: 'rcpt_sale', conversionId: 'conv_1', refundedCents: 4900 })
      expect((await processStripeEvent(integration, refund(4900))).outcome).toBe('duplicate')
      prismaMock.stripeEventReceipt.findFirst.mockResolvedValue({ id: 'rcpt_sale', conversionId: 'conv_1', refundedCents: 0 })
      prismaMock.stripeEventReceipt.updateMany.mockResolvedValue({ count: 0 })
      expect((await processStripeEvent(integration, refund(4900, 'evt_refund_2'))).outcome).toBe('duplicate')
      expect(prismaMock.conversionEvent.update).not.toHaveBeenCalled()
    })

    it('ignores refunds for sales it never attributed', async () => {
      prismaMock.stripeEventReceipt.findFirst.mockResolvedValue(null)
      expect((await processStripeEvent(integration, refund(100))).outcome).toBe('no_attribution')
    })
  })
})
