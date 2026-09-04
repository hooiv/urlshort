import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getDefaultWorkspace } from '@/lib/workspaces'
import { prisma } from '@/lib/prisma'
import { subscribeRedis, subscribeLocal } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

type RealtimeEvent = { type: string; id: string; at: string; data: Record<string, unknown> }

export function filterVisibleUrlIds(urlIds: unknown, visible: Set<string>): string[] {
  if (!Array.isArray(urlIds)) return []
  return urlIds.filter((id): id is string => typeof id === 'string' && visible.has(id))
}

export async function GET(request: NextRequest) {
  const u = await getCurrentUser(request)
  if (!u) return new Response('Unauthorized', { status: 401 })
  const w = await getDefaultWorkspace(u.id)
  if (!w) return new Response('Forbidden', { status: 403 })
  const memberships = await prisma.membership.findMany({ where: { userId: u.id }, select: { workspaceId: true } })
  const workspaceIds = new Set(memberships.map((m) => m.workspaceId))
  workspaceIds.add(w.id)
  const encoder = new TextEncoder()
  let closed = false
  let cleanup = () => {}
  const isVisible = async (event: RealtimeEvent): Promise<RealtimeEvent | null> => {
    if (event.type !== 'click.batch') return null
    const urlIds = Array.isArray(event.data.urlIds) ? event.data.urlIds.filter((id): id is string => typeof id === 'string') : []
    if (!urlIds.length) return null
    const visible = await prisma.url.findMany({
      where: { id: { in: urlIds }, OR: [{ userId: u.id }, { workspaceId: { in: [...workspaceIds] } }] },
      select: { id: true },
    })
    const visibleSet = new Set(visible.map((v) => v.id))
    const filtered = filterVisibleUrlIds(urlIds, visibleSet)
    if (!filtered.length) return null
    return { ...event, data: { ...event.data, urlIds: filtered } }
  }
  const stream = new ReadableStream({
    async start(controller) {
      const send = async (event: RealtimeEvent) => {
        if (closed) return
        const gated = await isVisible(event).catch(() => null)
        if (!gated) return
        controller.enqueue(encoder.encode(`event: ${gated.type}\ndata: ${JSON.stringify(gated)}\n\n`))
      }
      const sendReady = (event: RealtimeEvent) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))
      }
      sendReady({ type: 'ready', id: 'ready', at: new Date().toISOString(), data: { workspaceId: w.id } })
      const onLocal = (e: RealtimeEvent) => void send(e)
      const stopLocal = subscribeLocal(onLocal)
      cleanup = () => {
        closed = true
        stopLocal()
        controller.close()
      }
      if (process.env.REDIS_URL) await subscribeRedis((e) => void send(e), request.signal)
      request.signal.addEventListener('abort', cleanup, { once: true })
      const timer = setInterval(() => {
        if (closed) {
          clearInterval(timer)
          return
        }
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }, 15000)
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
