import { randomUUID } from 'node:crypto'
import { getRedis, withRedis } from '@/lib/redis'

/**
 * Cross-instance invalidation bus for the redirect read cache.
 *
 * Each app instance keeps its own in-process link cache. Without a bus, a
 * management change (blocking a phishing link, editing a destination,
 * deleting a link) is only visible on the instance that served the mutation;
 * every other instance keeps serving its cached copy until the TTL expires.
 *
 * When Redis is configured, every invalidation is also published on a shared
 * channel and applied by every subscribed instance. The bus is strictly an
 * accelerator:
 *  - Publishing never throws; a failed publish leaves the TTL as the bound.
 *  - While the subscription is down an instance cannot know what it missed,
 *    so the cache flushes itself and falls back to its short TTL (see
 *    `onDisconnect` / `onResync`).
 *  - Messages carry the publishing instance id so the origin does not evict
 *    twice, and a schema version so a rolling deploy can change the shape.
 */

export const LINK_CACHE_CHANNEL = 'ql:link-cache:invalidate:v1'

/** Bound the payload: Redis handles large messages, but fan-out cost scales with size. */
export const MAX_KEYS_PER_MESSAGE = 500

export type InvalidationTargets = {
  codes?: string[]
  ids?: string[]
  hosts?: string[]
  /** Drop every entry (bulk operations whose affected set is unknown). */
  all?: boolean
}

export type InvalidationMessage = InvalidationTargets & { v: 1; origin: string }

export type BusHandlers = {
  /** Apply an invalidation published by another instance. */
  onMessage: (targets: InvalidationTargets) => void
  /** The subscription is live (first connect or reconnect). */
  onConnected: () => void
  /** The subscription dropped; invalidations may be missed from now on. */
  onDisconnect: () => void
}

export type BusTransport = {
  publish: (channel: string, message: string) => Promise<boolean>
  /** Resolves to an unsubscribe function, or null when no backend is available. */
  subscribe: (channel: string, handlers: { message: (raw: string) => void; up: () => void; down: () => void }) => Promise<(() => void) | null>
}

export const instanceId: string = randomUUID()

function clean(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return []
  const out = new Set<string>()
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0 && value.length <= 2048) out.add(value)
  }
  return [...out]
}

/**
 * Split targets into messages of at most MAX_KEYS_PER_MESSAGE keys in total,
 * so one bulk operation never produces a single multi-megabyte publish.
 */
export function encodeInvalidation(targets: InvalidationTargets, origin = instanceId): string[] {
  if (targets.all) return [JSON.stringify({ v: 1, origin, all: true } satisfies InvalidationMessage)]
  const queue: Array<['codes' | 'ids' | 'hosts', string]> = []
  for (const kind of ['codes', 'ids', 'hosts'] as const) {
    for (const value of clean(targets[kind])) queue.push([kind, value])
  }
  const messages: string[] = []
  for (let i = 0; i < queue.length; i += MAX_KEYS_PER_MESSAGE) {
    const message: InvalidationMessage = { v: 1, origin }
    for (const [kind, value] of queue.slice(i, i + MAX_KEYS_PER_MESSAGE)) {
      ;(message[kind] ??= []).push(value)
    }
    messages.push(JSON.stringify(message))
  }
  return messages
}

/** Parse a bus message; returns null for foreign, malformed or own messages. */
export function decodeInvalidation(raw: string, self = instanceId): InvalidationTargets | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const message = parsed as Partial<InvalidationMessage>
  if (message.v !== 1 || typeof message.origin !== 'string' || message.origin === self) return null
  if (message.all === true) return { all: true }
  const targets: InvalidationTargets = { codes: clean(message.codes), ids: clean(message.ids), hosts: clean(message.hosts) }
  if (!targets.codes!.length && !targets.ids!.length && !targets.hosts!.length) return null
  return targets
}

/** Production transport: Redis PUBLISH on the shared client, SUBSCRIBE on a dedicated one. */
export const redisTransport: BusTransport = {
  publish: (channel, message) => withRedis(async (client) => {
    await client.publish(channel, message)
    return true
  }, false),
  subscribe: async (channel, handlers) => {
    const base = await getRedis()
    if (!base) return null
    // A connection in subscriber mode cannot run other commands, so the bus
    // gets its own. Unlike request-path clients it keeps retrying forever:
    // the subscription is long-lived and each reconnect triggers a resync.
    const sub = base.duplicate({ enableOfflineQueue: true, maxRetriesPerRequest: null, lazyConnect: true })
    sub.on('error', () => { /* reported through close/ready transitions */ })
    sub.on('message', (incoming: string, raw: string) => {
      if (incoming === channel) handlers.message(raw)
    })
    let subscribed = false
    sub.on('ready', () => {
      // ioredis replays SUBSCRIBE on reconnect (autoResubscribe) as part of
      // its ready sequence; the initial ready precedes our own SUBSCRIBE, so
      // it is ignored and announced explicitly below.
      if (subscribed) handlers.up()
    })
    sub.on('close', () => handlers.down())
    try {
      await sub.connect()
      await sub.subscribe(channel)
    } catch {
      sub.disconnect()
      return null
    }
    subscribed = true
    handlers.up()
    return () => {
      sub.removeAllListeners('message')
      sub.removeAllListeners('close')
      sub.removeAllListeners('ready')
      sub.disconnect()
    }
  },
}

/** How long to wait before retrying a subscription that found no backend. */
export const SUBSCRIBE_RETRY_MS = 30_000

type BusState = {
  transport: BusTransport
  starting: Promise<void> | null
  retryAt: number
  pending: boolean
  stop: (() => void) | null
  connected: boolean
  published: number
  received: number
  publishFailures: number
}

const globalForBus = globalThis as unknown as { __qlLinkCacheBus?: BusState }

function state(): BusState {
  globalForBus.__qlLinkCacheBus ??= { transport: redisTransport, starting: null, retryAt: 0, pending: false, stop: null, connected: false, published: 0, received: 0, publishFailures: 0 }
  return globalForBus.__qlLinkCacheBus
}

export function isBusConnected(): boolean {
  return state().connected
}

/**
 * Start listening once per process. Safe to call on every cache read: after
 * the first call it is a property check.
 */
export function ensureBusListener(handlers: BusHandlers): Promise<void> {
  const s = state()
  if (s.starting && (s.pending || s.stop || Date.now() < s.retryAt)) return s.starting
  s.pending = true
  s.starting = (async () => {
    try {
      s.stop = await s.transport.subscribe(LINK_CACHE_CHANNEL, {
        message: (raw) => {
          const targets = decodeInvalidation(raw)
          if (!targets) return
          s.received += 1
          handlers.onMessage(targets)
        },
        up: () => {
          if (s.connected) return
          s.connected = true
          handlers.onConnected()
        },
        down: () => {
          if (!s.connected) return
          s.connected = false
          handlers.onDisconnect()
        },
      })
    } catch {
      s.stop = null
    }
    // No backend (Redis absent, cooling down, or refused): try again later
    // rather than never, so an instance that booted during a Redis blip
    // eventually joins the bus.
    if (!s.stop) s.retryAt = Date.now() + SUBSCRIBE_RETRY_MS
    s.pending = false
  })()
  return s.starting
}

/** Publish to other instances. Never throws; returns how many messages went out. */
export async function publishInvalidation(targets: InvalidationTargets): Promise<number> {
  const s = state()
  let sent = 0
  for (const message of encodeInvalidation(targets)) {
    let ok = false
    try {
      ok = await s.transport.publish(LINK_CACHE_CHANNEL, message)
    } catch {
      ok = false
    }
    if (ok) sent += 1
    else s.publishFailures += 1
  }
  s.published += sent
  return sent
}

export function busStats() {
  const s = state()
  return { connected: s.connected, published: s.published, received: s.received, publishFailures: s.publishFailures }
}

/** Test hook: swap the transport and forget any subscription. */
export function __setBusTransportForTests(transport: BusTransport | null): void {
  const s = state()
  s.stop?.()
  globalForBus.__qlLinkCacheBus = { transport: transport ?? redisTransport, starting: null, retryAt: 0, pending: false, stop: null, connected: false, published: 0, received: 0, publishFailures: 0 }
}
