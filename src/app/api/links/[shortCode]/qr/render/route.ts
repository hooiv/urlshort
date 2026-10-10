import { NextRequest, NextResponse } from 'next/server'
import { handleQr } from '@/lib/qr-response'

/** Read-only render: POST only because a logo data URI cannot ride a query string. Accepts the same options as JSON plus `logo` (base64 data URI up to 256 KB), which cannot ride a query string. */
export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON body required' }, { status: 400 })
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) if (k !== 'logo' && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) params.set(k, String(v))
  const logo = typeof body.logo === 'string' ? body.logo : null
  return handleQr(request, context, params, logo)
}

