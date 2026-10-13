import { prisma } from '@/lib/prisma'

/**
 * Per-link activity timeline built from audit events. Gives teams the
 * "who changed this link and what changed" view Dub/Bitly expose, without
 * leaking secrets or network identifiers stored on the raw audit row.
 */

const SENSITIVE_KEY = /pass(word)?|secret|token|hash|signature|apikey|authorization/i
export const ACTIVITY_DEFAULT_LIMIT = 25
export const ACTIVITY_MAX_LIMIT = 100

export type ActivityChange = { field: string; before: unknown; after: unknown }
export type ActivityItem = {
  id: string
  action: string
  actorType: string
  actorUserId: string | null
  createdAt: string
  changes: ActivityChange[]
}

export function parseLimit(raw: string | null): number {
  if (raw === null || raw === '') return ACTIVITY_DEFAULT_LIMIT
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return ACTIVITY_DEFAULT_LIMIT
  return Math.min(n, ACTIVITY_MAX_LIMIT)
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.getTime()}:${id}`).toString('base64url')
}

export function decodeCursor(cursor: string | null): { createdAt: Date; id: string } | null | 'invalid' {
  if (!cursor) return null
  try {
    const [ms, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split(':')
    const id = rest.join(':')
    const time = Number(ms)
    if (!Number.isFinite(time) || !id) return 'invalid'
    return { createdAt: new Date(time), id }
  } catch {
    return 'invalid'
  }
}

function parseObject(json: string | null): Record<string, unknown> | null {
  if (!json) return null
  try {
    const value = JSON.parse(json)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Field-level diff of the audit before/after snapshots with secrets masked. */
export function diffSnapshots(beforeJson: string | null, afterJson: string | null): ActivityChange[] {
  const before = parseObject(beforeJson) ?? {}
  const after = parseObject(afterJson) ?? {}
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  const out: ActivityChange[] = []
  for (const field of keys) {
    const b = before[field]
    const a = after[field]
    if (JSON.stringify(b) === JSON.stringify(a)) continue
    if (SENSITIVE_KEY.test(field)) out.push({ field, before: b === undefined ? null : '[redacted]', after: a === undefined ? null : '[redacted]' })
    else out.push({ field, before: b === undefined ? null : b, after: a === undefined ? null : a })
  }
  return out
}

export async function listLinkActivity(urlId: string, options: { limit?: number; cursor?: string | null; action?: string | null } = {}) {
  const limit = options.limit ?? ACTIVITY_DEFAULT_LIMIT
  const cursor = decodeCursor(options.cursor ?? null)
  if (cursor === 'invalid') return { error: 'Invalid cursor' as const }
  const rows = await prisma.auditEvent.findMany({
    where: {
      urlId,
      ...(options.action ? { action: options.action } : {}),
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: { id: true, action: true, actorType: true, actorUserId: true, createdAt: true, beforeJson: true, afterJson: true },
  })
  const page = rows.slice(0, limit)
  const items: ActivityItem[] = page.map((r) => ({
    id: r.id,
    action: r.action,
    actorType: r.actorType,
    actorUserId: r.actorUserId,
    createdAt: r.createdAt.toISOString(),
    changes: diffSnapshots(r.beforeJson, r.afterJson),
  }))
  const last = page[page.length - 1]
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null }
}
