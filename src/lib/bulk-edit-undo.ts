import { prisma } from '@/lib/prisma'
import { invalidateLinks } from '@/lib/link-cache'
import { visibleUrlWhere } from '@/lib/folders'

/** Fields a bulk edit records in its audit before/after that can be restored verbatim. */
const SCALAR_FIELDS = ['maxClicks', 'dailyClickCap', 'expiredUrl', 'notStartedUrl', 'offHoursUrl', 'folderId', 'isActive', 'originalUrl'] as const
const DATE_FIELDS = ['expiresAt', 'startsAt'] as const

export type UndoSkip = { shortCode: string; reason: string }
export type UndoPlanItem = { id: string; shortCode: string; data: Record<string, unknown>; fields: string[] }
export type AuditLike = { id: string; urlId: string | null; beforeJson: string | null; afterJson: string | null }
export type CurrentLink = Record<string, unknown> & { id: string; shortCode: string; tags: string[] }

function parseJson(s: string | null): Record<string, unknown> | null {
  if (!s) return null
  try { const v = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null } catch { return null }
}

function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => v instanceof Date ? v.getTime() : (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? Date.parse(v) : (v ?? null))
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

/**
 * Pure planner. A field is restored only while the link still holds the value
 * the bulk edit wrote; if someone changed it since, that field is left alone
 * and the link is reported as skipped so an undo never clobbers newer work.
 */
export function planUndo(events: AuditLike[], current: Map<string, CurrentLink>): { items: UndoPlanItem[]; skipped: UndoSkip[] } {
  const items: UndoPlanItem[] = []
  const skipped: UndoSkip[] = []
  for (const ev of events) {
    const link = ev.urlId ? current.get(ev.urlId) : undefined
    if (!link) { skipped.push({ shortCode: ev.urlId ?? ev.id, reason: 'link no longer exists' }); continue }
    const before = parseJson(ev.beforeJson); const after = parseJson(ev.afterJson)
    if (!before || !after) { skipped.push({ shortCode: link.shortCode, reason: 'audit entry has no restorable values' }); continue }
    const data: Record<string, unknown> = {}
    const conflicts: string[] = []
    const consider = (field: string, restore: unknown) => {
      if (sameValue(link[field], after[field])) data[field] = restore
      else conflicts.push(field)
    }
    for (const f of SCALAR_FIELDS) if (f in before) consider(f, before[f] ?? null)
    for (const f of DATE_FIELDS) if (f in before) consider(f, before[f] ? new Date(before[f] as string) : null)
    if ('tags' in before && Array.isArray(before.tags)) {
      if (JSON.stringify(link.tags) === JSON.stringify(after.tags)) data.tags = before.tags
      else conflicts.push('tags')
    }
    const fields = Object.keys(data)
    if (!fields.length) { skipped.push({ shortCode: link.shortCode, reason: conflicts.length ? `changed since the bulk edit (${conflicts.join(', ')})` : 'nothing to restore' }); continue }
    if (conflicts.length) skipped.push({ shortCode: link.shortCode, reason: `partially restored; ${conflicts.join(', ')} changed since` })
    items.push({ id: link.id, shortCode: link.shortCode, data, fields })
  }
  return { items, skipped }
}

export type UndoResult = { ok: true; dryRun: boolean; restored: Array<{ id: string; shortCode: string; fields: string[] }>; skipped: UndoSkip[] } | { ok: false; status: 404 | 400; error: string }

/** Reverts one batch: every `link.bulk_edit` audit event the user wrote at the same instant (same batch) is undone in one transaction. */
export async function undoBulkEdit(userId: string, auditEventId: string, dryRun = false): Promise<UndoResult> {
  const anchor = await prisma.auditEvent.findFirst({ where: { id: auditEventId, action: 'link.bulk_edit', actorUserId: userId }, select: { id: true, createdAt: true, metadataJson: true } })
  if (!anchor) return { ok: false, status: 404, error: 'Bulk edit not found' }
  const events = await prisma.auditEvent.findMany({
    where: { action: 'link.bulk_edit', actorUserId: userId, createdAt: anchor.createdAt },
    select: { id: true, urlId: true, beforeJson: true, afterJson: true },
    take: 500,
  })
  const already = await prisma.auditEvent.findFirst({ where: { action: 'link.bulk_edit_undo', actorUserId: userId, metadataJson: { contains: JSON.stringify(anchor.id) } }, select: { id: true } })
  if (already) return { ok: false, status: 400, error: 'This bulk edit was already undone' }
  const ids = events.map((e) => e.urlId).filter((v): v is string => !!v)
  const rows = await prisma.url.findMany({ where: { AND: [{ id: { in: ids } }, visibleUrlWhere(userId)] } })
  const current = new Map(rows.map((r) => [r.id, r as unknown as CurrentLink]))
  const { items, skipped } = planUndo(events, current)
  const restored = items.map((i) => ({ id: i.id, shortCode: i.shortCode, fields: i.fields }))
  if (dryRun || !items.length) return { ok: true, dryRun, restored, skipped }
  await prisma.$transaction(async (tx) => {
    for (const i of items) await tx.url.update({ where: { id: i.id }, data: i.data, select: { id: true } })
    await tx.auditEvent.createMany({
      data: items.map((i) => ({
        action: 'link.bulk_edit_undo', actorType: 'user', actorUserId: userId, urlId: i.id, resourceType: 'url', resourceId: i.id,
        metadataJson: JSON.stringify({ undoes: anchor.id, fields: i.fields }),
      })),
    })
  }, { timeout: 30_000 })
  await invalidateLinks(rows.filter((r) => items.some((i) => i.id === r.id)))
  return { ok: true, dryRun, restored, skipped }
}
