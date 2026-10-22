import { NextRequest, NextResponse } from 'next/server'
import { ANALYTICS_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { minimumDetectableLift, parseSampleSizeInput, planSampleSize } from '@/lib/experiment-sample-size'

/**
 * With perVariantClicks instead of minRelativeLift it returns the minimum detectable lift.
 * GET /api/experiments/sample-size?baselineRate=0.05&minRelativeLift=0.2[&confidence&power&variants&dailyClicks]
 * How many clicks a destination experiment needs before a verdict is trustworthy.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'experiment-sample-size', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const resolved = await resolveActor(request, ANALYTICS_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const sp = request.nextUrl.searchParams
    if (sp.has('perVariantClicks')) {
      const baselineRate = Number(sp.get('baselineRate'))
      const perVariantClicks = Number(sp.get('perVariantClicks'))
      if (!(baselineRate > 0 && baselineRate < 1)) return NextResponse.json({ error: 'baselineRate must be between 0 and 1 (exclusive)' }, { status: 400 })
      if (!Number.isInteger(perVariantClicks) || perVariantClicks < 1 || perVariantClicks > 1e9) return NextResponse.json({ error: 'perVariantClicks must be a positive integer' }, { status: 400 })
      const lift = minimumDetectableLift({ baselineRate, perVariantClicks })
      return NextResponse.json({ baselineRate, perVariantClicks, minimumDetectableRelativeLift: lift }, { headers: { 'Cache-Control': 'private, max-age=300' } })
    }
    const input = parseSampleSizeInput(request.nextUrl.searchParams)
    if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })
    return NextResponse.json({ input, plan: planSampleSize(input) }, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (error) {
    console.error('Sample size failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
