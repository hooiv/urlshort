import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getManageableUrl } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { edgeTarget, normalizeHost, verificationRecord } from '@/lib/domains'
import { DomainOwnershipError, registerDomain } from '@/lib/domain-registration'
import { DnsSetupError, applyDnsRecords, detectDnsProvider } from '@/lib/dns-providers'

const ConnectBody = z.object({
  host: z.string().max(253),
  provider: z.enum(['cloudflare', 'vercel']),
  apiToken: z.string().min(20).max(512),
  teamId: z.string().max(100).optional(),
  replaceExisting: z.boolean().optional(),
})

/** GET ?host= → which supported DNS provider hosts the zone (for the one-click button). */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  let host: string
  try {
    host = normalizeHost(request.nextUrl.searchParams.get('host') ?? '')
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid host' }, { status: 400 })
  }
  const provider = await detectDnsProvider(host)
  return NextResponse.json({ host, provider })
}

/**
 * POST → writes the verification TXT and routing CNAME at the user's DNS
 * provider with a token they supply for this request only. The token is never
 * persisted or logged. Verification then completes via PATCH /domains (or the
 * domains cron) once the records resolve.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  const limit = await rateLimit(request, { name: 'domains-connect', identifier: access.url.id, limit: 5, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429, headers: rateLimitHeaders(limit) })

  const parsed = ConnectBody.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })
  let host: string
  try {
    host = normalizeHost(parsed.data.host)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid host' }, { status: 400 })
  }

  try {
    const domain = await registerDomain(access.url.id, host)
    const txt = verificationRecord(host, domain.verificationToken)
    const records = await applyDnsRecords({
      provider: parsed.data.provider,
      token: parsed.data.apiToken,
      teamId: parsed.data.teamId,
      host,
      replaceExisting: parsed.data.replaceExisting,
      records: [
        { type: 'TXT', name: txt.name, value: txt.value },
        { type: 'CNAME', name: host, value: edgeTarget() },
      ],
    })
    await recordAudit(request, {
      action: 'branded_domain.dns_connect',
      urlId: access.url.id,
      resourceType: 'branded_domain',
      resourceId: domain.id,
      after: { host, provider: parsed.data.provider, records: records.map((r) => ({ type: r.type, name: r.name, action: r.action })) },
    })
    return NextResponse.json({ host, provider: parsed.data.provider, records, verified: domain.status === 'verified' })
  } catch (error) {
    if (error instanceof DomainOwnershipError) return NextResponse.json({ error: error.message }, { status: 409 })
    if (error instanceof DnsSetupError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    console.error('DNS connect failed:', error instanceof Error ? error.message : 'unknown error')
    return NextResponse.json({ error: 'Could not configure DNS' }, { status: 500 })
  }
}
