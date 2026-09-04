import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { replicateRoutingSnapshot } from '@/lib/routing-config'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const headerSecret = request.headers.get('x-cron-secret') || ''
  const expected = Buffer.from(secret, 'utf8')
  const candidates = [bearer, headerSecret]
  return candidates.some((candidate) => {
    if (!candidate) return false
    const actual = Buffer.from(candidate, 'utf8')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
}

/** Retry only the newest unreplicated snapshot per workspace. Older snapshots
 * are superseded and must never be replayed into an eventually-consistent edge. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = await rateLimit(request, { name: 'cron-edge-config', limit: 4, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  try {
    const pending = await prisma.routingConfigSnapshot.findMany({ where: { replicatedAt: null }, orderBy: [{ workspaceId: 'asc' }, { version: 'desc' }], take: 500 })
    const newest = new Map<string, typeof pending[number]>()
    for (const snapshot of pending) if (!newest.has(snapshot.workspaceId)) newest.set(snapshot.workspaceId, snapshot)
    let replicated = 0
    for (const snapshot of newest.values()) if (await replicateRoutingSnapshot(snapshot)) replicated++
    return NextResponse.json({ scanned: pending.length, attempted: newest.size, replicated })
  } catch (error) {
    console.error('Cron edge-config error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
