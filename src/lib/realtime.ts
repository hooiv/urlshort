import { randomUUID } from 'node:crypto'
import { getRedis, isRedisCoolingDown } from '@/lib/redis'

export type RealtimeEvent = { type: string; id: string; at: string; data: Record<string, unknown>; workspaceId?: string | null }
type Listener = { fn: (event: RealtimeEvent) => void; workspaceId?: string | null }
const localListeners = new Set<Listener>()
/**
 * Untagged events keep legacy broadcast behavior. Callers handling
 * tenant-specific data MUST pass `opts.workspaceId` so workspace-scoped
 * subscribers only receive their own tenant's events.
 */
export function publishRealtime(type: string, data: Record<string, unknown>, opts?: { workspaceId?: string | null }) { const event: RealtimeEvent = { type, id: randomUUID(), at: new Date().toISOString(), data, workspaceId: opts?.workspaceId ?? null }; for (const { fn, workspaceId } of localListeners) { if (workspaceId && event.workspaceId && event.workspaceId !== workspaceId) continue; fn(event) } void getRedis().then(r => r?.publish('ql:events', JSON.stringify(event))).catch(() => {}) }
/** True when `event` may be delivered to `workspaceId` (untagged = legacy broadcast). */
export function isEventVisibleToWorkspace(event: Pick<RealtimeEvent, 'workspaceId'>, workspaceId: string): boolean { return !event.workspaceId || event.workspaceId === workspaceId }
export function subscribeLocal(fn: (event: RealtimeEvent) => void, opts?: { workspaceId?: string | null }) { const listener: Listener = { fn, workspaceId: opts?.workspaceId ?? null }; localListeners.add(listener); return () => { localListeners.delete(listener) } }
export async function subscribeRedis(onEvent: (event: RealtimeEvent) => void, signal: AbortSignal, opts?: { workspaceId?: string | null }) { const url = process.env.REDIS_URL; if (!url || isRedisCoolingDown()) return () => {}; const Redis = (await import('ioredis')).default; const sub = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false }); await sub.subscribe('ql:events'); const handler = (channel: string, message: string) => { if (channel !== 'ql:events') return; try { const event = JSON.parse(message) as RealtimeEvent; if (opts?.workspaceId && event.workspaceId && event.workspaceId !== opts.workspaceId) return; onEvent(event) } catch {} }; sub.on('message', handler); const close = () => { sub.removeListener('message', handler); void sub.unsubscribe().catch(() => {}); sub.disconnect() }; signal.addEventListener('abort', close, { once: true }); return close }
