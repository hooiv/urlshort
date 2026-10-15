import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getManageableUrl } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { applyDailyHistory, fetchBitlyDailyClicks, fetchShortIoDailyClicks } from '@/lib/click-history-import'

const Body = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('bitly'), apiToken: z.string().min(10).max(512), bitlinkId: z.string().min(3).max(210) }),
  z.object({ provider: z.literal('shortio'), apiToken: z.string().min(10).max(512), linkId: z.string().min(4).max(64) }),
])

/**
 * POST → copies up to a year of daily click counts for the matching Bitly link
 * into this link's analytics. The provider token is used for this request only.
 * Days that already have analytics are skipped, so retries never double count.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  const limit = await rateLimit(request, { name: 'import-clicks', identifier: access.url.id, limit: 5, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429, headers: rateLimitHeaders(limit) })

  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })

  let series
  try {
    series = parsed.data.provider === 'bitly'
      ? await fetchBitlyDailyClicks(parsed.data.apiToken, parsed.data.bitlinkId.trim())
      : await fetchShortIoDailyClicks(parsed.data.apiToken, parsed.data.linkId.trim())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed'
    const status = /rejected the token/.test(message) ? 401 : /Invalid (bitlink|Short\.io)/.test(message) ? 400 : 502
    return NextResponse.json({ error: message }, { status })
  }
  const result = await applyDailyHistory(prisma, access.url.id, series)
  await recordAudit(request, {
    action: 'analytics.history_import',
    urlId: access.url.id,
    resourceType: 'url',
    resourceId: access.url.id,
    after: { provider: parsed.data.provider, ...result },
  })
  return NextResponse.json({ provider: parsed.data.provider, daysFound: series.length, ...result })
}
