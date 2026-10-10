import type { Prisma } from '@prisma/client'
import { serializeCsv } from '@/lib/csv'
import { neutralizeFormula } from '@/lib/analytics-export'

export const AUDIT_EXPORT_MAX_ROWS = 10_000
const DAY = /^\d{4}-\d{2}-\d{2}$/

export type AuditQuery = {
  action?: string
  actorUserId?: string
  from?: Date
  to?: Date
  search?: string
}

/** Parses `from`/`to` (inclusive YYYY-MM-DD, UTC) and rejects reversed ranges. */
export function parseAuditRange(from: string | null, to: string | null): { from?: Date; to?: Date } {
  const parse = (value: string, label: string) => {
    if (!DAY.test(value)) throw new Error(`${label} must be YYYY-MM-DD`)
    const d = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error(`${label} is not a real date`)
    return d
  }
  const start = from ? parse(from, 'from') : undefined
  const endDay = to ? parse(to, 'to') : undefined
  const end = endDay ? new Date(endDay.getTime() + 86_400_000) : undefined // exclusive upper bound
  if (start && endDay && start > endDay) throw new Error('from must not be after to')
  return { from: start, to: end }
}

/**
 * Events belong to a workspace when they touch one of its links, or when the
 * writer stamped the workspace id into metadata. Personal events of members
 * outside the workspace are deliberately excluded.
 */
export function workspaceAuditWhere(workspaceId: string, linkIds: string[], q: AuditQuery): Prisma.AuditEventWhereInput {
  const and: Prisma.AuditEventWhereInput[] = [
    { OR: [...(linkIds.length ? [{ urlId: { in: linkIds } }] : []), { metadataJson: { contains: `"workspaceId":${JSON.stringify(workspaceId)}` } }] },
  ]
  if (q.action) and.push({ action: q.action.endsWith('*') ? { startsWith: q.action.slice(0, -1) } : q.action })
  if (q.actorUserId) and.push({ actorUserId: q.actorUserId })
  if (q.from || q.to) and.push({ createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } })
  if (q.search) {
    const contains = { contains: q.search, mode: 'insensitive' as const }
    and.push({ OR: [{ action: contains }, { resourceType: contains }, { resourceId: contains }, { metadataJson: contains }] })
  }
  return { AND: and }
}

export type AuditRow = {
  id: string
  createdAt: Date
  action: string
  actorType: string
  actorUserId: string | null
  urlId: string | null
  resourceType: string | null
  resourceId: string | null
  ipHash: string | null
  userAgent: string | null
  beforeJson: string | null
  afterJson: string | null
  metadataJson: string | null
}

export function auditToCsv(rows: AuditRow[]): string {
  const t = (v: string | null) => (v == null ? '' : neutralizeFormula(v))
  return serializeCsv([
    ['time', 'action', 'actor_type', 'actor_user_id', 'link_id', 'resource_type', 'resource_id', 'user_agent', 'before', 'after', 'metadata', 'event_id'],
    ...rows.map((r) => [r.createdAt.toISOString(), r.action, r.actorType, r.actorUserId ?? '', r.urlId ?? '', r.resourceType ?? '', r.resourceId ?? '', t(r.userAgent), t(r.beforeJson), t(r.afterJson), t(r.metadataJson), r.id]),
  ])
}

/** JSON-lines keeps large exports streamable and parseable per row. */
export function auditToJson(rows: AuditRow[]) {
  const parse = (v: string | null) => {
    if (v == null) return null
    try { return JSON.parse(v) } catch { return v }
  }
  return rows.map((r) => ({ id: r.id, time: r.createdAt.toISOString(), action: r.action, actorType: r.actorType, actorUserId: r.actorUserId, linkId: r.urlId, resourceType: r.resourceType, resourceId: r.resourceId, userAgent: r.userAgent, before: parse(r.beforeJson), after: parse(r.afterJson), metadata: parse(r.metadataJson) }))
}
