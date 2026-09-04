import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'

export const abuseReportSchema = z.object({
  shortCode: z.string().trim().min(1).max(64),
  reason: z.enum(['phishing', 'malware', 'spam', 'copyright', 'other']),
  details: z.string().trim().max(2000).nullish(),
  reporter: z.string().trim().max(254).nullish(),
})

export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'abuse-report', limit: 20, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many reports. Please try again shortly.' }, { status: 429 })
    const parsed = abuseReportSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'A valid short code and report reason are required' }, { status: 400 })
    const { shortCode, reason } = parsed.data
    const details = parsed.data.details?.trim().slice(0, 2000) || null
    const reporter = parsed.data.reporter?.trim().slice(0, 254) || null
    const url = await prisma.url.findUnique({ where: { shortCode }, select: { id: true } })
    if (!url) return NextResponse.json({ error: 'Short link not found' }, { status: 404 })
    const report = await prisma.abuseReport.create({ data: { urlId: url.id, reason, details, reporter } })
    return NextResponse.json({ id: report.id, status: report.status }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Could not submit abuse report' }, { status: 400 })
  }
}
