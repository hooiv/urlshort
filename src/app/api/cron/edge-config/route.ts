import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { replicateRoutingSnapshot } from '@/lib/routing-config'

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  return !secret || request.headers.get('authorization') === `Bearer ${secret}`
}

/** Retry only the newest unreplicated snapshot per workspace. Older snapshots
 * are superseded and must never be replayed into an eventually-consistent edge. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pending = await prisma.routingConfigSnapshot.findMany({ where: { replicatedAt: null }, orderBy: [{ workspaceId: 'asc' }, { version: 'desc' }], take: 500 })
  const newest = new Map<string, typeof pending[number]>()
  for (const snapshot of pending) if (!newest.has(snapshot.workspaceId)) newest.set(snapshot.workspaceId, snapshot)
  let replicated = 0
  for (const snapshot of newest.values()) if (await replicateRoutingSnapshot(snapshot)) replicated++
  return NextResponse.json({ scanned: pending.length, attempted: newest.size, replicated })
}
