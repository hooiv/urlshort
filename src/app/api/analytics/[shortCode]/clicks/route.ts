import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl, READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import {
  clicksToCsvChunk, clicksToNdjsonChunk, iterateClicks, parseClickExportFormat, parseClickExportRange,
} from '@/lib/click-export'

/**
 * GET /api/analytics/:shortCode/clicks?format=csv|ndjson&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Streams raw click events (no IP / user agent) for one link, oldest first, up to 100,000 rows.
 * Session auth or an API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'click-export', limit: 6, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, READ_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    const params = request.nextUrl.searchParams
    const format = parseClickExportFormat(params.get('format'))
    if (!format) return NextResponse.json({ error: 'format must be csv or ndjson' }, { status: 400 })
    const range = parseClickExportRange(params.get('from'), params.get('to'))
    if ('error' in range) return NextResponse.json({ error: range.error }, { status: 400 })

    await recordAudit(request, { action: 'clicks.export', resourceType: 'url', resourceId: access.url.id, after: { format, from: range.from.toISOString(), to: range.to.toISOString() } })

    const encoder = new TextEncoder()
    const pages = iterateClicks(access.url.id, range)
    let first = true
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await pages.next()
          if (done) {
            if (first && format === 'csv') controller.enqueue(encoder.encode(clicksToCsvChunk([], true)))
            controller.close()
            return
          }
          controller.enqueue(encoder.encode(format === 'csv' ? clicksToCsvChunk(value, first) : clicksToNdjsonChunk(value)))
          first = false
        } catch (error) {
          console.error('Click export stream failed:', error)
          controller.error(error)
        }
      },
      async cancel() { await pages.return(undefined) },
    })
    const ext = format === 'csv' ? 'csv' : 'ndjson'
    return new NextResponse(stream, {
      headers: {
        'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="${shortCode}-clicks.${ext}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Click export failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
