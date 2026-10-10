/** Pure helpers for exporting audit events as CSV / NDJSON. */

export const AUDIT_EXPORT_MAX_ROWS = 10_000

export interface AuditExportRow {
  id: string
  action: string
  actorType: string
  resourceType: string | null
  resourceId: string | null
  urlId: string | null
  metadataJson: string | null
  createdAt: Date
}

export const AUDIT_CSV_COLUMNS = [
  'id',
  'createdAt',
  'action',
  'actorType',
  'resourceType',
  'resourceId',
  'urlId',
  'metadata',
] as const

/** RFC 4180 quoting plus neutralisation of spreadsheet formula injection. */
export function csvCell(value: string | null | undefined): string {
  if (value == null) return ''
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function auditRowsToCsv(rows: AuditExportRow[]): string {
  const lines = [AUDIT_CSV_COLUMNS.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.createdAt.toISOString(),
        r.action,
        r.actorType,
        r.resourceType,
        r.resourceId,
        r.urlId,
        r.metadataJson,
      ]
        .map(csvCell)
        .join(',')
    )
  }
  return lines.join('\r\n') + '\r\n'
}

export function auditRowsToNdjson(rows: AuditExportRow[]): string {
  return rows
    .map((r) => JSON.stringify({ ...r, createdAt: r.createdAt.toISOString() }))
    .join('\n')
    .concat(rows.length ? '\n' : '')
}

/** Parse an inclusive YYYY-MM-DD or ISO bound; returns null if invalid. */
export function parseDateBound(raw: string | null, endOfDay: boolean): Date | null {
  if (!raw) return null
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw)
  const d = new Date(dateOnly ? `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : raw)
  if (Number.isNaN(d.getTime())) return null
  // Date rolls 2026-02-31 over to March; reject it instead of exporting the wrong range.
  if (dateOnly && d.toISOString().slice(0, 10) !== raw) return null
  return d
}
