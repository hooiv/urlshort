import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { autoArchiveStaleLinks } from '@/lib/auto-archive'

export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const expected = Buffer.from(secret, 'utf8')
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const header = req.headers.get('x-cron-secret') || ''
  return [bearer, header].some((c) => {
    if (!c) return false
    const a = Buffer.from(c, 'utf8')
    return a.length === expected.length && timingSafeEqual(a, expected)
  })
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, '')
    return NextResponse.json(await autoArchiveStaleLinks(baseUrl))
  } catch (error) {
    console.error('Cron auto-archive error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
