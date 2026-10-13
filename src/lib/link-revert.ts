import { prisma } from '@/lib/prisma'

/**
 * Undo a recorded change from a link's activity timeline. Only fields whose
 * previous value was captured in the audit snapshot can be reverted, and only
 * when the link still holds the value that change produced (no silent
 * clobbering of newer edits).
 */

export type RevertPlan =
  | { ok: true; data: { title?: string | null; isActive?: boolean; shortCode?: string }; fields: string[] }
  | { ok: false; status: 404 | 409 | 422; error: string }

type Snapshot = Record<string, unknown> | null

export function parseSnapshot(json: string | null): Snapshot {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const REVERTABLE: Record<string, string[]> = {
  'link.update': ['title', 'isActive'],
  'link.rename': ['shortCode'],
}

export function planRevert(
  event: { action: string; beforeJson: string | null; afterJson: string | null },
  current: { title: string | null; isActive: boolean; shortCode: string },
): RevertPlan {
  const allowed = REVERTABLE[event.action]
  if (!allowed) return { ok: false, status: 422, error: `Changes of type ${event.action} cannot be reverted` }
  const before = parseSnapshot(event.beforeJson)
  const after = parseSnapshot(event.afterJson) ?? {}
  if (!before) return { ok: false, status: 422, error: 'This event has no previous values to restore' }
  const data: { title?: string | null; isActive?: boolean; shortCode?: string } = {}
  const fields: string[] = []
  for (const field of allowed) {
    if (!(field in before) || JSON.stringify(before[field]) === JSON.stringify(after[field])) continue
    const now = current[field as keyof typeof current]
    if (JSON.stringify(now) !== JSON.stringify(after[field])) {
      return { ok: false, status: 409, error: `${field} was changed again after this event; revert the newer change first` }
    }
    const prev = before[field]
    if (field === 'isActive' && typeof prev !== 'boolean') continue
    if (field === 'title' && prev !== null && typeof prev !== 'string') continue
    if (field === 'shortCode' && typeof prev !== 'string') continue
    ;(data as Record<string, unknown>)[field] = prev
    fields.push(field)
  }
  if (fields.length === 0) return { ok: false, status: 422, error: 'Nothing to revert in this event' }
  return { ok: true, data, fields }
}

export async function loadEvent(urlId: string, eventId: string) {
  return prisma.auditEvent.findFirst({
    where: { id: eventId, urlId },
    select: { id: true, action: true, beforeJson: true, afterJson: true },
  })
}
