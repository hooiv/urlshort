import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { unfurlUrl } from '@/lib/unfurl'
import { rateLimit } from '@/lib/rate-limit'

export const unfurlSchema = z.object({ url: z.string().trim().min(1, { message: 'URL is required' }).max(2048, { message: 'URL is too long' }) })

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
    const parsed = unfurlSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'URL is required' }, { status: 400 })
    }
    const url = parsed.data.url

    const metadata = await unfurlUrl(url)
    return NextResponse.json(metadata)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not fetch metadata for this URL'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
