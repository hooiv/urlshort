import { createHmac, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { verifyAttributionToken } from './attribution'
import { getPrivacyPolicy, hashWithWorkspace } from './privacy-ingestion'
import { reserveUsageInTransaction } from './tenant-usage'
import { dispatchWebhooksForUrl } from './webhooks'

/**
 * Stripe sale attribution.
 *
 * Flow: a visitor clicks a short link, the redirect appends `ql_attribution`
 * to the destination's URL fragment, the merchant copies that token into
 * Stripe Checkout `metadata.ql_attribution`, and Stripe tells us about the
 * sale through a signed webhook. Renewals are credited to the same link via
 * the Stripe customer id captured on the first checkout.
 */

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300
/** ConversionEvent.valueCents is a 32-bit int; also the cap /api/track uses. */
export const MAX_SALE_VALUE_CENTS = 100_000_000
export const ATTRIBUTION_METADATA_KEYS = ['ql_attribution', 'quicklink_attribution'] as const

export type StripeSignatureCheck = { ok: true; timestamp: number } | { ok: false; reason: 'missing' | 'malformed' | 'expired' | 'mismatch' }

/**
 * Verifies a `Stripe-Signature` header (`t=<unix>,v1=<hex>[,v1=<hex>]`) the way
 * Stripe's SDK does: HMAC-SHA256 of `${t}.${rawBody}`, any v1 may match (Stripe
 * sends several while a secret is being rolled), and t must be within the
 * tolerance to stop replays of a captured request.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  options: { toleranceSeconds?: number; nowSeconds?: number } = {},
): StripeSignatureCheck {
  if (!header || !secret) return { ok: false, reason: 'missing' }
  let timestamp = NaN
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key === 't') timestamp = Number(value)
    else if (key === 'v1' && /^[0-9a-f]{64}$/i.test(value)) signatures.push(value.toLowerCase())
  }
  if (!Number.isSafeInteger(timestamp) || signatures.length === 0) return { ok: false, reason: 'malformed' }
  const tolerance = options.toleranceSeconds ?? STRIPE_SIGNATURE_TOLERANCE_SECONDS
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > tolerance) return { ok: false, reason: 'expired' }
  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex'), 'utf8')
  const matched = signatures.some((candidate) => {
    const actual = Buffer.from(candidate, 'utf8')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
  return matched ? { ok: true, timestamp } : { ok: false, reason: 'mismatch' }
}

/** Builds a valid header; used by tests and the "send test event" tooling. */
export function signStripePayload(rawBody: string, secret: string, timestampSeconds = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex')
  return `t=${timestampSeconds},v1=${v1}`
}

export function isValidStripeSigningSecret(value: unknown): value is string {
  return typeof value === 'string' && /^whsec_[A-Za-z0-9+/=_-]{16,200}$/.test(value)
}

export type StripeEvent = {
  id: string
  type: string
  livemode?: boolean
  data: { object: Record<string, unknown> }
}

export function parseStripeEvent(rawBody: string): StripeEvent | null {
  try {
    const event = JSON.parse(rawBody) as StripeEvent
    if (!event || typeof event.id !== 'string' || !event.id.startsWith('evt_') || event.id.length > 255) return null
    if (typeof event.type !== 'string' || !event.data || typeof event.data.object !== 'object' || event.data.object === null) return null
    return event
  } catch {
    return null
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
const asString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)
/** Stripe expands some ids into objects; accept either form. */
const idOf = (value: unknown): string | null => asString(value) ?? asString(asRecord(value)?.id)

function tokenFromMetadata(...sources: unknown[]): string | null {
  for (const source of sources) {
    const metadata = asRecord(source)
    if (!metadata) continue
    for (const key of ATTRIBUTION_METADATA_KEYS) {
      const value = asString(metadata[key])
      if (value) return value.trim()
    }
  }
  return null
}

export type SaleCandidate = {
  /** Synthetic receipt key so a sale is counted once even if Stripe reports it twice. */
  saleKey: string
  token: string | null
  customerId: string | null
  amountCents: number | null
  currency: string | null
  source: 'checkout' | 'invoice'
  /** Present on subscription checkouts: the first invoice is part of this sale. */
  coversInvoiceId: string | null
}

export function saleFromCheckoutSession(session: Record<string, unknown>): SaleCandidate | 'unpaid' {
  const status = asString(session.payment_status)
  if (status !== 'paid' && status !== 'no_payment_required') return 'unpaid'
  const id = asString(session.id) ?? 'unknown'
  const referenceId = asString(session.client_reference_id)
  return {
    saleKey: `checkout:${id}`,
    token: tokenFromMetadata(session.metadata) ?? (referenceId?.startsWith('v1.') ? referenceId : null),
    customerId: idOf(session.customer),
    amountCents: typeof session.amount_total === 'number' ? session.amount_total : null,
    currency: asString(session.currency),
    source: 'checkout',
    coversInvoiceId: idOf(session.invoice),
  }
}

export function saleFromInvoice(invoice: Record<string, unknown>): SaleCandidate {
  const parent = asRecord(invoice.parent)
  return {
    saleKey: `invoice:${asString(invoice.id) ?? 'unknown'}`,
    // Newer API versions moved subscription metadata under `parent`.
    token: tokenFromMetadata(
      invoice.metadata,
      asRecord(invoice.subscription_details)?.metadata,
      asRecord(parent?.subscription_details)?.metadata,
    ),
    customerId: idOf(invoice.customer),
    amountCents: typeof invoice.amount_paid === 'number' ? invoice.amount_paid : null,
    currency: asString(invoice.currency),
    source: 'invoice',
    coversInvoiceId: null,
  }
}

export function normalizeSaleValue(amountCents: number | null, currency: string | null): { valueCents: number | null; currency: string | null } {
  const code = currency && /^[a-z]{3}$/i.test(currency) ? currency.toUpperCase() : null
  if (amountCents === null || !Number.isInteger(amountCents) || amountCents < 0) return { valueCents: null, currency: code }
  return { valueCents: Math.min(amountCents, MAX_SALE_VALUE_CENTS), currency: code }
}

export type StripeIntegrationRecord = {
  id: string
  userId: string
  goalEventKey: string
  trackRecurring: boolean
}

export type StripeEventOutcome =
  | 'recorded'
  | 'duplicate'
  | 'ignored_event'
  | 'unpaid'
  | 'zero_amount'
  | 'no_attribution'
  | 'invalid_token'
  | 'foreign_link'
  | 'covered_by_checkout'
  | 'recurring_disabled'
  | 'quota_exceeded'
  | 'goal_disabled'

type Attribution = { urlId: string; clickEventId: string | null; visitorIdHash: string | null; via: 'token' | 'customer' }

async function canAttributeToLink(userId: string, link: { userId: string | null; workspaceId: string | null }): Promise<boolean> {
  if (link.userId === userId) return true
  if (!link.workspaceId) return false
  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: link.workspaceId, userId } },
    select: { id: true },
  })
  return !!membership
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

const dateKey = (date: Date) => date.toISOString().slice(0, 10)

class QuotaExceeded extends Error {}
class GoalDisabled extends Error {}

async function writeReceipt(integrationId: string, event: StripeEvent, outcome: StripeEventOutcome): Promise<void> {
  try {
    await prisma.stripeEventReceipt.create({ data: { integrationId, stripeEventId: event.id, type: event.type.slice(0, 120), outcome } })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
  }
}

/**
 * Applies one verified Stripe event. Idempotent: the event id and the sale key
 * are both recorded as receipts in the same transaction as the conversion, so a
 * retried or duplicated delivery can never count a sale twice.
 */
export async function processStripeEvent(
  integration: StripeIntegrationRecord,
  event: StripeEvent,
): Promise<{ outcome: StripeEventOutcome; conversionId?: string }> {
  const seen = await prisma.stripeEventReceipt.findUnique({
    where: { integrationId_stripeEventId: { integrationId: integration.id, stripeEventId: event.id } },
    select: { outcome: true, conversionId: true },
  })
  if (seen) return { outcome: 'duplicate', conversionId: seen.conversionId ?? undefined }

  const object = event.data.object
  let sale: SaleCandidate
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const candidate = saleFromCheckoutSession(object)
      if (candidate === 'unpaid') {
        await writeReceipt(integration.id, event, 'unpaid')
        return { outcome: 'unpaid' }
      }
      sale = candidate
      break
    }
    case 'invoice.paid':
      if (!integration.trackRecurring) {
        await writeReceipt(integration.id, event, 'recurring_disabled')
        return { outcome: 'recurring_disabled' }
      }
      sale = saleFromInvoice(object)
      break
    default:
      await writeReceipt(integration.id, event, 'ignored_event')
      return { outcome: 'ignored_event' }
  }

  const coveredSale = await prisma.stripeEventReceipt.findUnique({
    where: { integrationId_stripeEventId: { integrationId: integration.id, stripeEventId: sale.saleKey } },
    select: { conversionId: true },
  })
  if (coveredSale) {
    const outcome = sale.source === 'invoice' ? 'covered_by_checkout' : 'duplicate'
    await writeReceipt(integration.id, event, outcome)
    return { outcome, conversionId: coveredSale.conversionId ?? undefined }
  }

  const value = normalizeSaleValue(sale.amountCents, sale.currency)
  if (value.valueCents === 0) {
    await writeReceipt(integration.id, event, 'zero_amount')
    return { outcome: 'zero_amount' }
  }

  // Resolve which click earned this sale: an explicit token wins, otherwise the
  // click that first acquired this Stripe customer.
  let attribution: Attribution | null = null
  if (sale.token) {
    const payload = verifyAttributionToken(sale.token)
    if (!payload) {
      await writeReceipt(integration.id, event, 'invalid_token')
      return { outcome: 'invalid_token' }
    }
    attribution = { urlId: payload.urlId, clickEventId: payload.clickEventId, visitorIdHash: payload.visitorIdHash, via: 'token' }
  } else if (sale.customerId) {
    const known = await prisma.stripeCustomerAttribution.findUnique({
      where: { integrationId_stripeCustomerId: { integrationId: integration.id, stripeCustomerId: sale.customerId } },
      select: { urlId: true, clickEventId: true, visitorIdHash: true },
    })
    if (known) attribution = { ...known, via: 'customer' }
  }
  if (!attribution) {
    await writeReceipt(integration.id, event, 'no_attribution')
    return { outcome: 'no_attribution' }
  }

  const link = await prisma.url.findUnique({ where: { id: attribution.urlId }, select: { id: true, userId: true, workspaceId: true } })
  // A token is portable: without this check anyone could pump revenue into a
  // stranger's analytics by pasting one of their tokens into a checkout.
  if (!link || !(await canAttributeToLink(integration.userId, link))) {
    await writeReceipt(integration.id, event, 'foreign_link')
    return { outcome: 'foreign_link' }
  }

  let storedVisitor: string | null = attribution.visitorIdHash
  if (attribution.via === 'token' && link.workspaceId && storedVisitor) {
    const policy = await getPrivacyPolicy(link.workspaceId)
    storedVisitor = policy.aggregateOnly || !policy.hashVisitor ? null : hashWithWorkspace(storedVisitor, link.workspaceId)
  }
  const clickEventId = attribution.clickEventId
    ? (await prisma.clickEvent.findFirst({ where: { id: attribution.clickEventId, urlId: link.id }, select: { id: true, ruleId: true } }))
    : null

  const now = new Date()
  const metadata = JSON.stringify({ source: 'stripe', stripeEventId: event.id, saleKey: sale.saleKey, via: attribution.via, livemode: event.livemode ?? null })
  let conversionId: string
  try {
    conversionId = await prisma.$transaction(async (tx) => {
      // Receipts first: a concurrent duplicate trips the unique index and the
      // whole transaction (quota, conversion, aggregates) rolls back with it.
      await tx.stripeEventReceipt.create({ data: { integrationId: integration.id, stripeEventId: sale.saleKey, type: `sale.${sale.source}`, outcome: 'recorded' } })
      if (sale.coversInvoiceId) {
        await tx.stripeEventReceipt.create({ data: { integrationId: integration.id, stripeEventId: `invoice:${sale.coversInvoiceId}`, type: 'sale.invoice', outcome: 'covered_by_checkout' } })
      }
      if (link.workspaceId) {
        const usage = await reserveUsageInTransaction(tx, link.workspaceId, 'conversions', 1n)
        if (!usage.allowed) throw new QuotaExceeded()
      }
      const goal = await tx.goal.upsert({
        where: { urlId_eventKey: { urlId: link.id, eventKey: integration.goalEventKey } },
        create: { urlId: link.id, eventKey: integration.goalEventKey, name: 'Purchase (Stripe)' },
        update: {},
        select: { id: true, enabled: true },
      })
      // Respect a goal the user switched off rather than silently re-enabling it.
      if (!goal.enabled) throw new GoalDisabled()
      const conversion = await tx.conversionEvent.create({
        data: {
          urlId: link.id,
          goalId: goal.id,
          clickEventId: clickEventId?.id ?? null,
          ruleId: clickEventId?.ruleId ?? null,
          visitorIdHash: storedVisitor,
          valueCents: value.valueCents,
          currency: value.currency,
          metadata,
        },
        select: { id: true },
      })
      await tx.conversionDaily.upsert({
        where: { goalId_dateKey: { goalId: goal.id, dateKey: dateKey(now) } },
        create: { goalId: goal.id, dateKey: dateKey(now), conversions: 1, valueCents: value.valueCents ?? 0 },
        update: { conversions: { increment: 1 }, valueCents: { increment: value.valueCents ?? 0 } },
      })
      await tx.stripeEventReceipt.create({ data: { integrationId: integration.id, stripeEventId: event.id, type: event.type.slice(0, 120), outcome: 'recorded', conversionId: conversion.id } })
      if (attribution.via === 'token' && sale.customerId && integration.trackRecurring) {
        await tx.stripeCustomerAttribution.upsert({
          where: { integrationId_stripeCustomerId: { integrationId: integration.id, stripeCustomerId: sale.customerId } },
          // First touch wins: a later checkout through another link does not
          // steal an existing customer's renewals.
          create: { integrationId: integration.id, stripeCustomerId: sale.customerId, urlId: link.id, clickEventId: clickEventId?.id ?? null, visitorIdHash: storedVisitor },
          update: {},
        })
      }
      return conversion.id
    })
  } catch (error) {
    if (error instanceof QuotaExceeded) {
      // No receipt: Stripe retries for days, so the sale lands if quota frees up.
      return { outcome: 'quota_exceeded' }
    }
    if (error instanceof GoalDisabled) {
      await writeReceipt(integration.id, event, 'goal_disabled')
      return { outcome: 'goal_disabled' }
    }
    if (isUniqueViolation(error)) return { outcome: 'duplicate' }
    throw error
  }

  try {
    await dispatchWebhooksForUrl(link.id, 'conversion.recorded', {
      id: conversionId,
      urlId: link.id,
      goalEventKey: integration.goalEventKey,
      valueCents: value.valueCents,
      currency: value.currency,
      source: 'stripe',
      occurredAt: now.toISOString(),
    })
  } catch (error) {
    console.error('Stripe conversion webhook fan-out failed:', error)
  }
  return { outcome: 'recorded', conversionId }
}
