import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { getManageableUrl } from '@/lib/authorization'
import { resolveActor, LINK_READ_SCOPES } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { QrDesignError, isCustomDesign, parseQrDesign, renderQrPng, renderQrSvg, withScanSource } from '@/lib/qr-design'
import { buildZip, type ZipEntry } from '@/lib/zip-store'
import { getBaseUrl } from '@/lib/utils'

const MAX_CODES = 100

/**
 * POST /api/links/qr-zip  { codes: string[] (max 100), format?: 'png'|'svg', track?: boolean, ...design params }
 * Returns a ZIP with one QR per link (only links the caller can read; others are listed in X-QR-Skipped).
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'qr-zip', limit: 6, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    let body: Record<string, unknown>
    try {
      const parsed = await request.json()
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape')
      body = parsed as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const codes = Array.isArray(body.codes) ? [...new Set(body.codes.filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length <= 64))] : []
    if (codes.length === 0) return NextResponse.json({ error: 'codes must be a non-empty array of short codes' }, { status: 400 })
    if (codes.length > MAX_CODES) return NextResponse.json({ error: `At most ${MAX_CODES} codes per archive` }, { status: 400 })
    const format = body.format === 'svg' ? 'svg' : 'png'
    const params = new URLSearchParams()
    for (const key of ['size', 'margin', 'dark', 'dark2', 'light', 'level', 'dots', 'eyes', 'eyeColor', 'transparent', 'logoScale', 'caption']) {
      const v = body[key]
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') params.set(key, String(v))
    }
    let design
    try {
      design = parseQrDesign(params, typeof body.logo === 'string' ? body.logo : null)
    } catch (e) {
      if (e instanceof QrDesignError) return NextResponse.json({ error: e.message }, { status: 400 })
      throw e
    }
    const resolved = await resolveActor(request, LINK_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const track = body.track === true
    const entries: ZipEntry[] = []
    const skipped: string[] = []
    for (const code of codes) {
      const access = await getManageableUrl(request, code)
      if (!access.url) { skipped.push(code); continue }
      const target = withScanSource(`${getBaseUrl()}/${access.url.shortCode}`, track)
      let data: Uint8Array
      if (format === 'svg') {
        data = Buffer.from(isCustomDesign(design) ? renderQrSvg(target, design) : await QRCode.toString(target, { type: 'svg', margin: design.margin, errorCorrectionLevel: design.level, color: { dark: design.dark, light: design.light } }))
      } else {
        data = isCustomDesign(design)
          ? await renderQrPng(target, design)
          : await QRCode.toBuffer(target, { width: design.size, margin: design.margin, errorCorrectionLevel: design.level, color: { dark: design.dark, light: design.light } })
      }
      entries.push({ name: `${access.url.shortCode}.${format}`, data })
    }
    if (entries.length === 0) return NextResponse.json({ error: 'No readable links among the codes', skipped }, { status: 404 })
    return new NextResponse(new Uint8Array(buildZip(entries)), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="quicklink-qr-codes.zip"',
        'Cache-Control': 'private, no-store',
        'X-QR-Count': String(entries.length),
        'X-QR-Skipped': skipped.slice(0, 100).join(','),
      },
    })
  } catch (error) {
    console.error('QR zip failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
