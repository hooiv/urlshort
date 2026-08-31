import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { clickQueue } from '@/lib/queue'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

/**
 * Cron processor that drains the Redis-backed click queue into Postgres.
 * Authorization is timing-safe and mirrors the webhook DLQ route.
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

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = await rateLimit(request, { name: 'process-clicks', limit: 4, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  try {
    await clickQueue.processBatch()
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Cron process clicks error:', e)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
