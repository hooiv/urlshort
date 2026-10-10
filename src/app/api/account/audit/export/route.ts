import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  AUDIT_EXPORT_MAX_ROWS,
  auditRowsToCsv,
  auditRowsToNdjson,
  parseDateBound,
} from '@/lib/account-audit-export'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const p = request.nextUrl.searchParams
  const format = p.get('format') === 'json' ? 'json' : 'csv'
  const fromRaw = p.get('from')
  const toRaw = p.get('to')
  const from = parseDateBound(fromRaw, false)
  const to = parseDateBound(toRaw, true)
  if ((fromRaw && !from) || (toRaw && !to)) {
    return NextResponse.json({ error: 'Invalid from/to date' }, { status: 400 })
  }
  if (from && to && from > to) {
    return NextResponse.json({ error: 'from must be before to' }, { status: 400 })
  }
  const action = (p.get('action') || '').trim().slice(0, 100)
  const rows = await prisma.auditEvent.findMany({
    where: {
      actorUserId: user.id,
      ...(action ? { action } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: AUDIT_EXPORT_MAX_ROWS,
    select: {
      id: true, action: true, actorType: true, resourceType: true, resourceId: true,
      urlId: true, metadataJson: true, createdAt: true,
    },
  })
  const body = format === 'json' ? auditRowsToNdjson(rows) : auditRowsToCsv(rows)
  return new NextResponse(body, {
    headers: {
      'Content-Type': format === 'json' ? 'application/x-ndjson; charset=utf-8' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-log.${format === 'json' ? 'ndjson' : 'csv'}"`,
      'Cache-Control': 'private, no-store',
      'X-Export-Truncated': rows.length >= AUDIT_EXPORT_MAX_ROWS ? '1' : '0',
    },
  })
}
