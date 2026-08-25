import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { getManageableUrl, EDIT_ROLES } from '@/lib/authorization'

export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, EDIT_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
    const link = access.url

    const body = await request.json().catch(() => ({}))
    const webhookUrl = (body.webhookUrl || link.webhookUrl || '').trim()

    if (!webhookUrl) {
      return NextResponse.json({ error: 'No webhook URL configured or provided' }, { status: 400 })
    }

    try {
      const parsed = new URL(webhookUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Webhook URL must be HTTP or HTTPS')
      }
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
    const secret = process.env.QL_ATTRIBUTION_SECRET || 'quicklink_webhook_secret'
    const signature = createHmac('sha256', secret).update(payloadString).digest('hex')

    const startTime = Date.now()
    let responseStatus = 0
    let responseText = ''
    let succeeded = false

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
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
