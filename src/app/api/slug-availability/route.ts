import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { classifySlugs, suggestAlternatives, validCandidates, MAX_AVAILABILITY_CODES } from '@/lib/slug-availability'

export const availabilitySchema = z.object({
  codes: z.array(z.string().max(100)).min(1).max(MAX_AVAILABILITY_CODES),
})

/** POST { codes: string[] } -> availability + readability score per code. */
export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { name: 'slug-availability', limit: 60, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

  const body = await request.json().catch(() => null)
  const parsed = availabilitySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Provide 1-${MAX_AVAILABILITY_CODES} codes` },
      { status: 400 },
    )
  }
  const candidates = validCandidates(parsed.data.codes)
  const existing = candidates.length
    ? await prisma.url.findMany({
        where: { OR: candidates.map((c) => ({ shortCode: { equals: c, mode: 'insensitive' as const } })) },
        select: { shortCode: true },
      })
    : []
  const taken = new Set(existing.map((e) => e.shortCode.toLowerCase()))
  const results = classifySlugs(parsed.data.codes, taken)
  // One extra query covers every alternative for every blocked code.
  const blocked = results.filter((r) => r.status === 'taken' || r.status === 'reserved')
  const pool = new Map<string, string[]>()
  const poolCodes = new Set<string>()
  for (const r of blocked) {
    const raw = suggestAlternatives(r.code, new Set(), 12)
    pool.set(r.code, raw)
    raw.forEach((c) => poolCodes.add(c))
  }
  const poolTaken = poolCodes.size
    ? await prisma.url.findMany({
        where: { OR: [...poolCodes].map((c) => ({ shortCode: { equals: c, mode: 'insensitive' as const } })) },
        select: { shortCode: true },
      })
    : []
  const unavailable = new Set([...taken, ...poolTaken.map((e) => e.shortCode.toLowerCase())])
  return NextResponse.json({
    results: results.map((r) =>
      r.status === 'taken' || r.status === 'reserved'
        ? { ...r, alternatives: (pool.get(r.code) ?? []).filter((c) => !unavailable.has(c.toLowerCase())).slice(0, 5) }
        : r,
    ),
  })
}
