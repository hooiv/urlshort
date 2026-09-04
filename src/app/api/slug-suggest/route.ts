import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { generateSlugSuggestions } from '@/lib/slug'
import { rateLimit } from '@/lib/rate-limit'

export const slugSuggestSchema = z.object({
  title: z.string().max(200).optional().default(''),
  url: z.string().max(2048).optional().default(''),
})

export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'slug-suggest', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = slugSuggestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid suggestion request' }, { status: 400 })
    }
    const { title, url } = parsed.data

    const candidates = generateSlugSuggestions(title, url)
    if (candidates.length === 0) {
      return NextResponse.json({ suggestions: [] })
    }

    // Check which candidates already exist in the database
    const existing = await prisma.url.findMany({
      where: {
        shortCode: { in: candidates },
      },
      select: { shortCode: true },
    })

    const taken = new Set(existing.map((e) => e.shortCode.toLowerCase()))
    const available = candidates.filter((c) => !taken.has(c.toLowerCase()))

    return NextResponse.json({ suggestions: available })
  } catch (error) {
    console.error('Slug suggestion error:', error)
    return NextResponse.json({ error: 'Failed to generate slug suggestions' }, { status: 500 })
  }
}
