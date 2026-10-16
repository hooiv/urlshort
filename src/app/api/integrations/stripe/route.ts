import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { isValidStripeSigningSecret } from '@/lib/stripe-attribution'
import { beginRouteIdempotency, releaseRouteIdempotency, storeRouteIdempotency } from '@/lib/idempotency-route'
import { MAX_INTEGRATIONS_PER_USER, integrationSelect, presentIntegration, stripeIntegrationCreateSchema } from '@/lib/stripe-integrations'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await prisma.stripeIntegration.findMany({ where: { userId: user.id }, select: integrationSelect, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(rows.map(presentIntegration))
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const limit = await rateLimit(request, { name: 'stripe-integration-create', limit: 10, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const parsed = stripeIntegrationCreateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    if (parsed.data.signingSecret !== undefined && !isValidStripeSigningSecret(parsed.data.signingSecret)) {
      return NextResponse.json({ error: 'signingSecret must be the Stripe webhook signing secret (starts with whsec_)' }, { status: 400 })
    }
    const idem = await beginRouteIdempotency(request, user.id, { route: 'stripe-integration', ...parsed.data })
    if (idem.invalid) return NextResponse.json({ error: idem.invalid }, { status: 400 })
    if (idem.replay) return idem.replay as NextResponse
    try {
    const existing = await prisma.stripeIntegration.count({ where: { userId: user.id } })
    if (existing >= MAX_INTEGRATIONS_PER_USER) {
      await releaseRouteIdempotency(idem)
      return NextResponse.json({ error: `At most ${MAX_INTEGRATIONS_PER_USER} Stripe integrations per account` }, { status: 409 })
    }

    const row = await prisma.stripeIntegration.create({
      data: {
        userId: user.id,
        name: parsed.data.name ?? 'Stripe',
        signingSecret: parsed.data.signingSecret ?? '',
        // Inert until Stripe's signing secret is pasted in.
        isActive: parsed.data.signingSecret !== undefined,
        goalEventKey: parsed.data.goalEventKey ?? 'purchase',
        trackRecurring: parsed.data.trackRecurring ?? true,
      },
      select: integrationSelect,
    })
    const body = presentIntegration(row)
    await storeRouteIdempotency(request, idem, 201, JSON.parse(JSON.stringify(body)))
    return NextResponse.json(body, { status: 201 })
    } catch (inner) {
      await releaseRouteIdempotency(idem)
      throw inner
    }
  } catch (error) {
    console.error('Create Stripe integration failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
