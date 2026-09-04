/**
 * Pure audit-log logic: query building, response parsing, and date formatting.
 *
 * Kept separate from the React page so it is unit-testable in the node
 * vitest environment (no DOM). Mirrors GET /api/account/audit, which returns
 * `{ items: AuditEvent[], nextCursor: string | null }` (older clients may
 * still see a bare array).
 */

export interface AuditEvent {
  id: string
  action: string
  actorType: string
  resourceType: string | null
  resourceId: string | null
  createdAt: string
  metadataJson: string | null
}

export const MAX_AUDIT_SEARCH_LENGTH = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAuditEvent(value: unknown): value is AuditEvent {
  if (!isRecord(value)) return false
  return (
    typeof value['id'] === 'string' &&
    typeof value['action'] === 'string' &&
    typeof value['actorType'] === 'string' &&
    typeof value['createdAt'] === 'string'
  )
}

function normalizeEvent(value: unknown): AuditEvent | null {
  if (!isAuditEvent(value)) return null
  const record = value as unknown as Record<string, unknown>
  return {
    id: value.id,
    action: value.action,
    actorType: value.actorType,
    resourceType:
      typeof record['resourceType'] === 'string' ? (record['resourceType'] as string) : null,
    resourceId: typeof record['resourceId'] === 'string' ? (record['resourceId'] as string) : null,
    createdAt: value.createdAt,
    metadataJson:
      typeof record['metadataJson'] === 'string' ? (record['metadataJson'] as string) : null,
  }
}

/** Build the GET /api/account/audit query string. Trims and caps at 200 chars. */
export function buildAuditQuery(search: string): string {
  const trimmed = search.trim().slice(0, MAX_AUDIT_SEARCH_LENGTH)
  if (!trimmed) return ''
  return `?search=${encodeURIComponent(trimmed)}`
}

/**
 * Accept both the current `{ items }` envelope and a legacy bare array.
 * Drops malformed entries instead of crashing the list render.
 */
export function parseAuditResponse(data: unknown): AuditEvent[] {
  if (Array.isArray(data)) {
    const events: AuditEvent[] = []
    for (const entry of data) {
      const normalized = normalizeEvent(entry)
      if (normalized) events.push(normalized)
    }
    return events
  }
  if (isRecord(data) && Array.isArray(data['items'])) {
    const events: AuditEvent[] = []
    for (const entry of data['items'] as unknown[]) {
      const normalized = normalizeEvent(entry)
      if (normalized) events.push(normalized)
    }
    return events
  }
  return []
}

/** Locale date-time for an ISO string, or a safe fallback for invalid input. */
export function formatAuditDate(iso: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return 'Unknown date'
  return new Date(time).toLocaleString()
}

/** One-line resource summary, e.g. "url · abc123 · owner". */
export function formatAuditSubtitle(event: Pick<AuditEvent, 'resourceType' | 'resourceId' | 'actorType'>): string {
  const resource = event.resourceType || 'account'
  const withId = event.resourceId ? `${resource} · ${event.resourceId}` : resource
  return `${withId} · ${event.actorType}`
}

/** Pull a user-facing message out of an unknown API error body. */
export function getAuditErrorMessage(data: unknown, fallback: string): string {
  if (isRecord(data) && typeof data['error'] === 'string' && data['error'].trim()) {
    return data['error']
  }
  return fallback
}
