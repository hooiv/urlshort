import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres check of the sale -> commission -> refund -> payout lifecycle. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: commissions', () => {
  it.skipIf(!databaseUrl)('creates one commission per sale, shrinks it on refund, and guards payout transitions', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    process.env.QL_ATTRIBUTION_SECRET ||= 'integration-test-secret-0123456789abcdef'
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { processStripeEvent } = await import('./stripe-attribution')
    const { createAttributionToken } = await import('./attribution')
    const { transitionCommissions } = await import('./commissions')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await db.user.create({ data: { email: `c-${tag}@example.com`, password: 'x' } })
    try {
      const link = await db.url.create({ data: { shortCode: `c${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: user.id } })
      const integration = await db.stripeIntegration.create({ data: { userId: user.id, signingSecret: 'whsec_x', isActive: true } })
      await db.rewardConfig.create({ data: { userId: user.id, scopeKey: 'account', rules: '[]', fallback: JSON.stringify({ type: 'percent', amount: 1000 }) } })
      await db.rewardConfig.create({
        data: { userId: user.id, scopeKey: `link:${link.id}`, urlId: link.id, rules: JSON.stringify([{ id: 'pro', key: 'plan', equals: ['pro'], type: 'percent', amount: 2000 }]), fallback: null },
      })
      const token = createAttributionToken({ urlId: link.id, shortCode: link.shortCode, clickEventId: 'click-none', visitorIdHash: 'vis-hash', issuedAt: Date.now() })
      const record = { id: integration.id, userId: user.id, goalEventKey: 'purchase', trackRecurring: true }
      const sale = (id: string, plan: string) => ({
        id: `evt_${id}`, type: 'checkout.session.completed', livemode: false,
        data: { object: { id: `cs_${id}`, payment_status: 'paid', amount_total: 10_000, currency: 'usd', customer: `cus_${id}`, payment_intent: `pi_${id}`, metadata: { ql_attribution: token, plan } } },
      })

      const first = await processStripeEvent(record, sale('a', 'pro'))
      expect(first.outcome).toBe('recorded')
      // Redelivery must not create a second commission.
      expect((await processStripeEvent(record, sale('a', 'pro'))).outcome).toBe('duplicate')
      // No rule matches -> link scope sets nothing -> account fallback (10%).
      const second = await processStripeEvent(record, sale('b', 'basic'))
      expect(second.outcome).toBe('recorded')

      const rows = await db.commission.findMany({ where: { userId: user.id }, orderBy: { amountCents: 'desc' } })
      expect(rows.map((r) => [r.amountCents, r.ruleId, r.scopeKey])).toEqual([[2000, 'pro', `link:${link.id}`], [1000, null, 'account']])

      // Partial refund (25%) shrinks the pending commission; a repeat is idempotent.
      const refund = (id: string, total: number, evt: string) => ({ id: evt, type: 'charge.refunded', livemode: false, data: { object: { id: `ch_${id}`, payment_intent: `pi_${id}`, amount_refunded: total } } })
      expect((await processStripeEvent(record, refund('a', 2500, 'evt_r1'))).outcome).toBe('refunded')
      expect((await processStripeEvent(record, refund('a', 2500, 'evt_r1b'))).outcome).toBe('duplicate')
      const afterPartial = await db.commission.findUniqueOrThrow({ where: { conversionId: first.conversionId! } })
      expect(afterPartial.amountCents).toBe(1500)

      // Full refund of the second sale reverses it outright.
      await processStripeEvent(record, refund('b', 10_000, 'evt_r2'))
      expect((await db.commission.findUniqueOrThrow({ where: { conversionId: second.conversionId! } })).status).toBe('reversed')

      // Lifecycle: approve -> pay, each guarded by source status.
      const ids = [afterPartial.id]
      expect(await transitionCommissions(db, user.id, 'pay', ids)).toBe(0)
      expect(await transitionCommissions(db, user.id, 'approve', ids)).toBe(1)
      expect(await transitionCommissions(db, user.id, 'approve', ids)).toBe(0)
      expect(await transitionCommissions(db, 'someone-else', 'pay', ids)).toBe(0)
      expect(await transitionCommissions(db, user.id, 'pay', ids, { payoutRef: 'wire-1' })).toBe(1)
      expect(await transitionCommissions(db, user.id, 'reverse', ids)).toBe(0)

      // A refund after payout becomes a clawback, not an edit of what was paid.
      await processStripeEvent(record, refund('a', 5000, 'evt_r3'))
      const paid = await db.commission.findUniqueOrThrow({ where: { id: afterPartial.id } })
      expect([paid.status, paid.amountCents, paid.clawbackCents, paid.payoutRef]).toEqual(['paid', 1500, 1000, 'wire-1'])
    } finally {
      await db.user.delete({ where: { id: user.id } }).catch(() => undefined)
      await db.$disconnect()
    }
  }, 60_000)
})
