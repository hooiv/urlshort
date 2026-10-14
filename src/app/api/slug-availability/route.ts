import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { classifySlugs, validCandidates, MAX_AVAILABILITY_CODES } from '@/lib/slug-availability'

export const availabilitySchema = z.object({
  codes: z.array(z.string().max(100)).min(1).max(MAX_AVAILABILITY_CODES),
})

/** POST { codes: string[] } -> availability + readability score per code. */
export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { name: 'slug-availability', limit: 60, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

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
  return NextResponse.json({ results: classifySlugs(parsed.data.codes, taken) })
}
