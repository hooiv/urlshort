import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getManageableUrl } from '@/lib/authorization'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { applyDailyHistory, fetchBitlyDailyClicks } from '@/lib/click-history-import'

const Body = z.object({
  provider: z.literal('bitly'),
  apiToken: z.string().min(10).max(512),
  bitlinkId: z.string().min(3).max(210),
})

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
  if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })

  let series
  try {
    series = await fetchBitlyDailyClicks(parsed.data.apiToken, parsed.data.bitlinkId.trim())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed'
    const status = /rejected the token/.test(message) ? 401 : /Invalid bitlink/.test(message) ? 400 : 502
    return NextResponse.json({ error: message }, { status })
  }
  const result = await applyDailyHistory(prisma, access.url.id, series)
  await recordAudit(request, {
    action: 'analytics.history_import',
    urlId: access.url.id,
    resourceType: 'url',
    resourceId: access.url.id,
    after: { provider: 'bitly', ...result },
  })
  return NextResponse.json({ provider: 'bitly', daysFound: series.length, ...result })
}
