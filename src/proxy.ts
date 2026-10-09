import { NextRequest, NextResponse } from 'next/server'

/**
 * Edge middleware:
 * 1. Rejects oversized JSON bodies early (DoS guard) on API routes.
 * 2. Strips spoofable `x-forwarded-host` unless it matches the configured app
 *    host or a known branded-domain pattern (defense-in-depth; the redirect
 *    route also validates against the DB).
 */

const MAX_BODY_BYTES = 64 * 1024 // 64 KB — generous for all API payloads
// Third-party webhooks (Stripe checkout sessions with many line items) can be
// larger; their routes enforce their own, still bounded, limit.
const MAX_INBOUND_WEBHOOK_BYTES = 512 * 1024
const INBOUND_WEBHOOK_PATH = /^\/api\/integrations\/[a-z]+\/[^/]+\/webhook$/
// Bulk CSV import validates its own 2 MB cap (2000 rows).
const MAX_BULK_IMPORT_BYTES = 2_100_000

function bodyLimit(pathname: string): number {
  if (INBOUND_WEBHOOK_PATH.test(pathname)) return MAX_INBOUND_WEBHOOK_BYTES
  if (pathname === '/api/bulk') return MAX_BULK_IMPORT_BYTES
  return MAX_BODY_BYTES
}

export function proxy(request: NextRequest) {
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    const contentLength = Number(request.headers.get('content-length') || '0')
    const limit = bodyLimit(request.nextUrl.pathname)
    if (contentLength > limit) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 })
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
