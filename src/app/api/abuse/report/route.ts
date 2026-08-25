import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const REASONS = new Set(['phishing', 'malware', 'spam', 'copyright', 'other'])

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const shortCode = typeof body.shortCode === 'string' ? body.shortCode.trim() : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    const details = typeof body.details === 'string' ? body.details.trim().slice(0, 2000) || null : null
    const reporter = typeof body.reporter === 'string' ? body.reporter.trim().slice(0, 254) || null : null
    if (!shortCode || !REASONS.has(reason)) return NextResponse.json({ error: 'A valid short code and report reason are required' }, { status: 400 })
    const url = await prisma.url.findUnique({ where: { shortCode }, select: { id: true } })
    if (!url) return NextResponse.json({ error: 'Short link not found' }, { status: 404 })
    const report = await prisma.abuseReport.create({ data: { urlId: url.id, reason, details, reporter } })
    return NextResponse.json({ id: report.id, status: report.status }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Could not submit abuse report' }, { status: 400 })
  }
}
