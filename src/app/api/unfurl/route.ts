import { NextRequest, NextResponse } from 'next/server'
import { unfurlUrl } from '@/lib/unfurl'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'unfurl', limit: 40, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many metadata requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const body = await request.json().catch(() => ({}))
    const url = typeof body.url === 'string' ? body.url.trim() : ''

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const metadata = await unfurlUrl(url)
    return NextResponse.json(metadata)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not fetch metadata for this URL'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
