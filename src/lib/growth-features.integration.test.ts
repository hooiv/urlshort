import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/**
 * Real-Postgres checks for the lease admission, Stripe attribution and
 * aggregated analytics SQL. Opt-in via SOAK_DATABASE_URL (a disposable DB),
 * like production-soak.integration.test.ts: never DATABASE_URL.
 */
const databaseUrl = process.env.SOAK_DATABASE_URL

function useDb() {
  process.env.DATABASE_URL = databaseUrl
  process.env.DIRECT_DATABASE_URL = databaseUrl
  process.env.QL_ATTRIBUTION_SECRET = process.env.QL_ATTRIBUTION_SECRET || 'soak-secret-at-least-32-characters-long'
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } })
}
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

describe('real database: growth features', () => {
  it.skipIf(!databaseUrl)('lease admission never exceeds the quota under contention and returns leftovers', async () => {
    const db = useDb()
    const { admitBillableClick, resetClickAdmissionForTests, sweepExpiredLeases } = await import('./click-admission')
    resetClickAdmissionForTests()
    const slug = unique('lease')
    const workspace = await db.workspace.create({ data: { name: slug, slug } })
    try {
      await db.tenantQuota.create({ data: { workspaceId: workspace.id, clicksPerMonth: 137n } })
      const results = await Promise.all(Array.from({ length: 400 }, () => admitBillableClick(workspace.id)))
      expect(results.filter((r) => r.admitted)).toHaveLength(137)
      const bucket = () => db.usageBucket.findUnique({ where: { workspaceId_metric_periodKey: { workspaceId: workspace.id, metric: 'clicks', periodKey: new Date().toISOString().slice(0, 7) } } })
      expect((await bucket())?.quantity).toBe(137n)

      // A partially used lease hands its remainder back when swept.
      await db.tenantQuota.update({ where: { workspaceId: workspace.id }, data: { clicksPerMonth: 10_000n } })
      resetClickAdmissionForTests()
      await admitBillableClick(workspace.id)
      expect((await bucket())!.quantity).toBeGreaterThan(138n)
      await sweepExpiredLeases(Date.now() + 60_000)
      expect((await bucket())?.quantity).toBe(138n)
    } finally {
      resetClickAdmissionForTests()
      await db.workspace.delete({ where: { id: workspace.id } })
      await db.$disconnect()
    }
  }, 60_000)

  it.skipIf(!databaseUrl)('records a Stripe sale once, credits renewals and reverses refunds', async () => {
    const db = useDb()
    const { processStripeEvent } = await import('./stripe-attribution')
    const { createAttributionToken } = await import('./attribution')
    const user = await db.user.create({ data: { email: `${unique('stripe')}@example.com`, password: 'x' } })
    try {
      const link = await db.url.create({ data: { originalUrl: 'https://shop.example.com', shortCode: unique('s').slice(0, 30), userId: user.id } })
      const click = await db.clickEvent.create({ data: { urlId: link.id } })
      const integration = await db.stripeIntegration.create({ data: { userId: user.id, signingSecret: 'whsec_test_0123456789abcdef' } })
      const token = createAttributionToken({ urlId: link.id, shortCode: link.shortCode, clickEventId: click.id, visitorIdHash: 'v', issuedAt: Date.now() })
      const checkout = {
        id: 'evt_checkout_1', type: 'checkout.session.completed',
        data: { object: { id: 'cs_1', payment_status: 'paid', amount_total: 5000, currency: 'usd', customer: 'cus_1', invoice: 'in_first', payment_intent: 'pi_1', metadata: { ql_attribution: token } } },
      }
      const [a, b] = await Promise.all([processStripeEvent(integration, checkout), processStripeEvent(integration, { ...checkout, id: 'evt_checkout_dup' })])
      expect([a.outcome, b.outcome].sort()).toEqual(['duplicate', 'recorded'])
      expect(await db.conversionEvent.count({ where: { urlId: link.id } })).toBe(1)

      const firstInvoice = await processStripeEvent(integration, { id: 'evt_inv_1', type: 'invoice.paid', data: { object: { id: 'in_first', customer: 'cus_1', amount_paid: 5000, currency: 'usd' } } })
      expect(firstInvoice.outcome).toBe('covered_by_checkout')
      const renewal = await processStripeEvent(integration, { id: 'evt_inv_2', type: 'invoice.paid', data: { object: { id: 'in_2', customer: 'cus_1', amount_paid: 2000, currency: 'usd' } } })
      expect(renewal.outcome).toBe('recorded')

      expect((await processStripeEvent(integration, { id: 'evt_ref_1', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount_refunded: 1500 } } })).outcome).toBe('refunded')
      expect((await processStripeEvent(integration, { id: 'evt_ref_2', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount_refunded: 1500 } } })).outcome).toBe('duplicate')

      const daily = await db.conversionDaily.findMany({ where: { goal: { urlId: link.id } } })
      expect(daily.reduce((sum, row) => sum + row.conversions, 0)).toBe(2)
      expect(daily.reduce((sum, row) => sum + row.valueCents, 0)).toBe(5000 + 2000 - 1500)
    } finally {
      await db.user.delete({ where: { id: user.id } })
      await db.$disconnect()
    }
  }, 60_000)

  it.skipIf(!databaseUrl)('aggregates clicks, conversions, tags and breakdowns across a workspace', async () => {
    const db = useDb()
    const { getAggregatedAnalytics, resolveWindow } = await import('./aggregate-analytics')
    const slug = unique('agg')
    const workspace = await db.workspace.create({ data: { name: slug, slug } })
    try {
      const today = new Date().toISOString().slice(0, 10)
      const mk = (code: string, tags: string[]) => db.url.create({ data: { originalUrl: 'https://example.com', shortCode: unique(code).slice(0, 30), workspaceId: workspace.id, tags } })
      const [l1, l2] = await Promise.all([mk('a', ['launch', 'paid']), mk('b', ['launch'])])
      await db.clickDaily.createMany({ data: [{ urlId: l1.id, dateKey: today, clicks: 30 }, { urlId: l2.id, dateKey: today, clicks: 10 }] })
      await db.clickEvent.createMany({ data: [
        { urlId: l1.id, country: 'US', deviceType: 'mobile', referrerHost: 'x.com' },
        { urlId: l1.id, country: 'US', deviceType: 'desktop' },
        { urlId: l2.id, country: 'IN', deviceType: 'mobile', trafficType: 'bot' },
      ] })
      const goal = await db.goal.create({ data: { urlId: l1.id, name: 'Purchase', eventKey: 'purchase' } })
      await db.conversionDaily.create({ data: { goalId: goal.id, dateKey: today, conversions: 3, valueCents: 900 } })

      const all = await getAggregatedAnalytics({ kind: 'workspace', workspaceId: workspace.id }, resolveWindow({ range: '7d' }))
      expect(all.links).toBe(2)
      expect(all.totals).toMatchObject({ clicks: 40, conversions: 3, revenueCents: 900, conversionRate: 7.5 })
      expect(all.timeseries).toHaveLength(7)
      expect(all.topLinks.map((l) => [l.id, l.clicks, l.conversions])).toEqual([[l1.id, 30, 3], [l2.id, 10, 0]])
      expect(all.tags).toEqual([{ tag: 'launch', links: 2, clicks: 40 }, { tag: 'paid', links: 1, clicks: 30 }])
      expect(all.breakdowns.countries).toEqual([{ key: 'US', clicks: 2 }])
      expect(all.breakdowns.devices.map((d) => d.key).sort()).toEqual(['desktop', 'mobile'])

      const paid = await getAggregatedAnalytics({ kind: 'workspace', workspaceId: workspace.id, tag: 'paid' }, resolveWindow({ range: '7d' }))
      expect(paid.totals.clicks).toBe(30)
      expect(paid.links).toBe(1)
    } finally {
      await db.workspace.delete({ where: { id: workspace.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
