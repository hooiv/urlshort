import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseStripeEvent, processStripeEvent, verifyStripeSignature } from '@/lib/stripe-attribution'

/** Stripe events are a few KB; refuse anything absurd before hashing it. */
const MAX_BODY_BYTES = 512 * 1024

/**
 * Receives Stripe webhook events for one connected Stripe account. The raw
 * body must be read as text: re-serialising parsed JSON breaks the signature.
 *
 * Status codes follow Stripe's retry semantics: 2xx stops retries (including
 * for events we deliberately ignore), 4xx means "this delivery is wrong",
 * 5xx asks Stripe to retry later (used for quota pressure and outages).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })

  try {
    const integration = await prisma.stripeIntegration.findUnique({
      where: { id },
      select: { id: true, userId: true, signingSecret: true, goalEventKey: true, trackRecurring: true, isActive: true, livemode: true },
    })
    // Same response for unknown and paused integrations: don't leak which ids exist.
    if (!integration || !integration.isActive || !integration.signingSecret) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const signature = verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), integration.signingSecret)
    if (!signature.ok) return NextResponse.json({ error: `Invalid signature (${signature.reason})` }, { status: 400 })

    const event = parseStripeEvent(rawBody)
    if (!event) return NextResponse.json({ error: 'Malformed event' }, { status: 400 })

    const result = await processStripeEvent(integration, event)
    await prisma.stripeIntegration.update({
      where: { id: integration.id },
      data: { lastEventAt: new Date(), ...(typeof event.livemode === 'boolean' && integration.livemode !== event.livemode ? { livemode: event.livemode } : {}) },
    }).catch(() => undefined)

    if (result.outcome === 'quota_exceeded') {
      return NextResponse.json({ received: true, outcome: result.outcome }, { status: 503, headers: { 'Retry-After': '3600' } })
    }
    return NextResponse.json({ received: true, outcome: result.outcome, conversionId: result.conversionId ?? null })
  } catch (error) {
    console.error('Stripe webhook processing failed:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
