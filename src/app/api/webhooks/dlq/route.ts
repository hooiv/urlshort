import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { processDeadLetterQueue, WEBHOOK_MAX_RETRIES } from '@/lib/webhooks'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Cron processor for pending webhook deliveries (retries with exponential
 * backoff up to WEBHOOK_MAX_RETRIES, then dead-letters them).
 *
 * Authorization mirrors the maintenance sweep: require the configured cron
 * secret via `Authorization: Bearer $CRON_SECRET` (Vercel Cron sets this
 * automatically) or `x-cron-secret`. Compared with a timing-safe equality so
 * the endpoint is not an oracle for guessing the secret byte-by-byte.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const headerSecret = request.headers.get('x-cron-secret') || ''
  const expected = Buffer.from(secret, 'utf8')
  const candidates = [bearer, headerSecret]
  return candidates.some((candidate) => {
    if (!candidate) return false
    const actual = Buffer.from(candidate, 'utf8')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
}

async function handler(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Belt-and-braces against accidental tight-loop scheduling.
  const limit = await rateLimit(request, { name: 'webhook-dlq', limit: 4, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  try {
    const results = await processDeadLetterQueue()
    return NextResponse.json({ ...results, maxRetries: WEBHOOK_MAX_RETRIES })
  } catch (error) {
    console.error('DLQ processing error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handler(request)
}

/** Retained for self-hosted crons configured with POST. */
export async function POST(request: NextRequest) {
  return handler(request)
}
