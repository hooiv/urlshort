import { NextRequest, NextResponse } from 'next/server'
import { buildOpenApiDocument } from '@/lib/openapi'

/** GET /api/openapi.json: public, cacheable OpenAPI 3.1 description of the REST API. */
export async function GET(request: NextRequest) {
  const doc = buildOpenApiDocument(request.nextUrl.origin)
  return NextResponse.json(doc, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
