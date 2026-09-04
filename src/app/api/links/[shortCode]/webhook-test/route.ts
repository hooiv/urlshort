import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHmac } from 'node:crypto'
import { getManageableUrl, EDIT_ROLES } from '@/lib/authorization'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'
import { rateLimit } from '@/lib/rate-limit'

export const webhookTestSchema = z.object({
  webhookUrl: z.string().trim().max(2048).optional(),
})

export function validateWebhookHttps(input: string): URL {
  const parsed = new URL(input)
  if (parsed.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS')
  return parsed
}

export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, EDIT_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
    const link = access.url

    // Probes trigger outbound requests to third parties — throttle per link.
    const limit = await rateLimit(request, { name: 'webhook-test', identifier: link.id, limit: 5, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many webhook tests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

    const parsedBody = webhookTestSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsedBody.success) return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 })
    const webhookUrl = (parsedBody.data.webhookUrl || link.webhookUrl || '').trim()

    if (!webhookUrl) {
      return NextResponse.json({ error: 'No webhook URL configured or provided' }, { status: 400 })
    }

    try {
      const parsed = validateWebhookHttps(webhookUrl)
      await assertDestinationSafeForStorage(parsed.toString())
    } catch {
      return NextResponse.json({ error: 'Enter a valid webhook destination URL' }, { status: 400 })
    }

    const testPayload = {
      event: 'link.test_ping',
      timestamp: new Date().toISOString(),
      data: {
        shortCode: link.shortCode,
        urlId: link.id,
        title: link.title || 'QuickLink Campaign',
        destination: link.originalUrl,
        sampleEvent: {
          clickEventId: crypto.randomUUID(),
          country: 'US',
          city: 'San Francisco',
          deviceType: 'desktop',
          os: 'macos',
          browser: 'chrome',
          channel: 'social',
          referrer: 't.co',
        },
      },
    }

    const payloadString = JSON.stringify(testPayload)
    const secret = process.env.QL_ATTRIBUTION_SECRET
    if (!secret) return NextResponse.json({ error: 'Webhook signing secret is not configured' }, { status: 503 })
    const signature = createHmac('sha256', secret).update(payloadString).digest('hex')

    const startTime = Date.now()
    let responseStatus = 0
    let responseText = ''
    let succeeded = false

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        // Do not follow redirects: the initial URL is SSRF-checked, but a
        // 3xx to 169.254.169.254 / localhost would otherwise bypass the guard.
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'QuickLink-Webhook-Dispatcher/1.0',
          'X-QuickLink-Signature': `sha256=${signature}`,
          'X-QuickLink-Event': 'link.test_ping',
        },
        body: payloadString,
        signal: AbortSignal.timeout(6000),
      })
      responseStatus = res.status
      responseText = await res.text().catch(() => '')
      succeeded = res.ok
    } catch (fetchError) {
      return NextResponse.json({
        success: false,
        error: fetchError instanceof Error ? fetchError.message : 'Connection failed or timed out (6s)',
        webhookUrl,
        latencyMs: Date.now() - startTime,
      }, { status: 502 })
    }

    return NextResponse.json({
      success: succeeded,
      statusCode: responseStatus,
      responseBodySnippet: responseText.slice(0, 500),
      latencyMs: Date.now() - startTime,
      dispatchedPayload: testPayload,
    })
  } catch (error) {
    console.error('Webhook test failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error testing webhook' },
      { status: 500 }
    )
  }
}