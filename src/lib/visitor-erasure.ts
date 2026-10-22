import { prisma } from '@/lib/prisma'
import { hashWithWorkspace, normalizeIp } from '@/lib/privacy-ingestion'

/**
 * Data-subject erasure (GDPR art. 17 / CCPA delete): remove the raw click
 * events that identify one visitor inside a workspace. Click rows store either
 * the raw IP or its workspace-salted hash (depending on the privacy policy in
 * force when they were recorded), so both forms are matched. Daily rollups
 * hold no personal data and stay, so totals do not change.
 */
export type ErasureSubject = { ip?: string | null; visitorId?: string | null }

export type ParsedErasure = { ips: string[]; visitorIds: string[] }

export function parseErasureSubject(subject: ErasureSubject, workspaceId: string): ParsedErasure | { error: string } {
  const rawIp = typeof subject.ip === 'string' && subject.ip.trim() ? subject.ip : null
  const visitor = typeof subject.visitorId === 'string' && subject.visitorId.trim() ? subject.visitorId.trim() : null
  if (!rawIp && !visitor) return { error: 'Provide an ip or a visitorId' }
  const ips: string[] = []
  if (rawIp) {
    const ip = normalizeIp(rawIp)
    if (!ip) return { error: 'ip must be a literal IPv4 or IPv6 address' }
    ips.push(ip, hashWithWorkspace(ip, workspaceId))
  }
  const visitorIds: string[] = []
  if (visitor) {
    if (visitor.length > 128) return { error: 'visitorId is too long' }
    // Stored either as sent (hashVisitor off) or salted-hashed (on).
    visitorIds.push(visitor, hashWithWorkspace(visitor, workspaceId))
  }
  return { ips, visitorIds }
}

export function erasureWhere(workspaceId: string, parsed: ParsedErasure) {
  const or: Record<string, unknown>[] = []
  if (parsed.ips.length) or.push({ ip: { in: parsed.ips } })
  if (parsed.visitorIds.length) or.push({ visitorIdHash: { in: parsed.visitorIds } })
  return { url: { workspaceId }, OR: or }
}

export async function eraseVisitor(workspaceId: string, subject: ErasureSubject, opts: { dryRun?: boolean } = {}) {
  const parsed = parseErasureSubject(subject, workspaceId)
  if ('error' in parsed) return { error: parsed.error } as const
  const where = erasureWhere(workspaceId, parsed)
  if (opts.dryRun) return { matched: await prisma.clickEvent.count({ where }), deleted: 0, dryRun: true } as const
  // Conversions reference clicks; their FK is ON DELETE CASCADE/SET NULL per schema.
  const res = await prisma.clickEvent.deleteMany({ where })
  return { matched: res.count, deleted: res.count, dryRun: false } as const
}
