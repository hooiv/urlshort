import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { buildLinkPreview } from '@/lib/link-preview'

/** GET /api/preview/:shortCode — public, click-free summary of where a link goes. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'link-preview', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const { shortCode } = await params
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(shortCode)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const link = await prisma.url.findUnique({
      where: { shortCode },
      select: { shortCode: true, originalUrl: true, title: true, description: true, isActive: true, deletedAt: true, startsAt: true, expiresAt: true, maxClicks: true, clicks: true, passwordHash: true, cloaked: true },
    })
    const preview = link ? buildLinkPreview(link) : null
    if (!preview) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: rateLimitHeaders(limit) })
    return NextResponse.json(preview, { headers: { ...rateLimitHeaders(limit), 'Cache-Control': 'public, max-age=30', 'X-Robots-Tag': 'noindex' } })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
