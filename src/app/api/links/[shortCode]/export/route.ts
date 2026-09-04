import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getManageableUrl, READ_ROLES } from '@/lib/authorization'
import { rateLimit } from '@/lib/rate-limit'

const MAX_ROWS = 10_000

export function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  // Prevent spreadsheet formula injection: prefix =, +, -, @, tab/CR payloads.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/**
 * GET /api/links/[shortCode]/export?from=&to=
 * Streams the link's click events as CSV (bounded to 10k most recent rows).
 * Auth: management token or workspace read role.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'export', limit: 10, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, READ_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    const params = request.nextUrl.searchParams
    const fromParam = params.get('from')
    const toParam = params.get('to')
    const createdAt: Record<string, Date> = {}
    if (fromParam) {
      const from = new Date(`${fromParam}T00:00:00.000Z`)
      if (Number.isNaN(from.getTime())) return NextResponse.json({ error: 'Invalid from date' }, { status: 400 })
      createdAt.gte = from
    }
    if (toParam) {
      const to = new Date(`${toParam}T23:59:59.999Z`)
      if (Number.isNaN(to.getTime())) return NextResponse.json({ error: 'Invalid to date' }, { status: 400 })
      createdAt.lte = to
    }

    const clicks = await prisma.clickEvent.findMany({
      where: { urlId: access.url.id, ...(Object.keys(createdAt).length ? { createdAt } : {}) },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
      select: { createdAt: true, country: true, city: true, deviceType: true, referrerHost: true, ruleId: true },
    })

    const header = ['clicked_at', 'country', 'city', 'device', 'referrer', 'rule_id']
    const lines = [header.join(',')]
    for (const click of clicks) {
      lines.push([
        csvEscape(click.createdAt.toISOString()),
        csvEscape(click.country || ''),
        csvEscape(click.city || ''),
        csvEscape(click.deviceType || ''),
        csvEscape(click.referrerHost || 'Direct'),
        csvEscape(click.ruleId || ''),
      ].join(','))
    }

    const url = await prisma.url.findUnique({ where: { id: access.url.id }, select: { shortCode: true } })
    const filename = `quicklink-clicks-${url?.shortCode || shortCode}-${new Date().toISOString().slice(0, 10)}.csv`
    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('CSV export failed:', error)
    return NextResponse.json({ error: 'Could not export clicks' }, { status: 500 })
  }
}
