import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { suggestSlugsFromUrl } from '@/lib/slug-from-url'
import { assessSlugQuality } from '@/lib/slug-quality'

export const suggestionSchema = z.object({ url: z.string().url().max(2048) })

/** POST { url } -> free, readable short-code suggestions for that destination. */
export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { name: 'slug-suggestions', limit: 60, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
  const parsed = suggestionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Provide a valid http(s) url' }, { status: 400 })

  const candidates = suggestSlugsFromUrl(parsed.data.url, 12)
  const existing = candidates.length
    ? await prisma.url.findMany({
        where: { OR: candidates.map((c) => ({ shortCode: { equals: c, mode: 'insensitive' as const } })) },
        select: { shortCode: true },
      })
    : []
  const taken = new Set(existing.map((e) => e.shortCode.toLowerCase()))
  const suggestions = candidates
    .filter((c) => !taken.has(c.toLowerCase()))
    .slice(0, 6)
    .map((code) => ({ code, quality: assessSlugQuality(code) }))
  return NextResponse.json({ suggestions })
}
