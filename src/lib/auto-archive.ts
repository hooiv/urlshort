import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { sendEmail } from './email'
import { invalidateLinks } from './link-cache'
import { STALE_DAYS_OPTIONS } from './stale-links'

/**
 * Opt-in auto-archive: owners who set User.autoArchiveStaleDays have personal
 * links with no human click (and no creation) inside that window archived
 * daily. Archived links stay restorable (isActive=false, nothing is deleted),
 * every change gets an audit event, and the owner gets one summary email.
 */
export const AUTO_ARCHIVE_BATCH = 200
const DAY_MS = 86_400_000

export function parseAutoArchiveDays(v: unknown): number | null | undefined {
  if (v === null) return null
  if (typeof v === 'number' && (STALE_DAYS_OPTIONS as readonly number[]).includes(v)) return v
  return undefined
}

export function renderAutoArchiveEmail(name: string | null, links: { shortCode: string; originalUrl: string }[], days: number, baseUrl: string) {
  const shown = links.slice(0, 20).map((l) => `- ${baseUrl}/${l.shortCode} -> ${l.originalUrl}`)
  const more = links.length > shown.length ? `\n...and ${links.length - shown.length} more` : ''
  return {
    subject: `${links.length} idle link${links.length === 1 ? '' : 's'} archived`,
    text: `${name ? `Hi ${name},\n\n` : ''}These links had no visitor clicks for ${days} days and were archived:\n\n${shown.join('\n')}${more}\n\nRestore any of them from ${baseUrl}/manage/stale or change the window at ${baseUrl}/account/notifications\n`,
  }
}

type Row = { id: string; shortCode: string; originalUrl: string }

/** Archive one owner's stale personal links; returns what changed. */
export async function archiveStaleForUser(userId: string, days: number, now = new Date()): Promise<Row[]> {
  const cutoff = new Date(now.getTime() - days * DAY_MS)
  const candidates = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."originalUrl" FROM "urls" u
    WHERE u."userId" = ${userId} AND u."workspaceId" IS NULL AND u."deletedAt" IS NULL
      AND u."isActive" = true AND u."createdAt" < ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM "click_events" c WHERE c."urlId" = u."id" AND c."trafficType" = 'human' AND c."createdAt" >= ${cutoff})
    ORDER BY u."createdAt" ASC LIMIT ${AUTO_ARCHIVE_BATCH}`)
  if (candidates.length === 0) return []
  const ids = candidates.map((c) => c.id)
  const changed = await prisma.$transaction(async (tx) => {
    // Compare-and-set so a link re-activated mid-run is not touched twice.
    const upd = await tx.url.updateMany({ where: { id: { in: ids }, isActive: true, deletedAt: null }, data: { isActive: false } })
    if (upd.count === 0) return [] as Row[]
    await tx.auditEvent.createMany({
      data: candidates.map((c) => ({
        action: 'link.auto_archive', actorType: 'system', actorUserId: userId, urlId: c.id, resourceType: 'url', resourceId: c.id,
        beforeJson: JSON.stringify({ isActive: true }), afterJson: JSON.stringify({ isActive: false }), metadataJson: JSON.stringify({ idleDays: days }),
      })),
    })
    return candidates
  })
  if (changed.length) await invalidateLinks(changed).catch((e) => console.error('Auto-archive cache invalidation failed:', e))
  return changed
}

export async function autoArchiveStaleLinks(baseUrl: string, now = new Date()): Promise<{ owners: number; links: number; failedEmails: number }> {
  const users = await prisma.user.findMany({ where: { autoArchiveStaleDays: { not: null } }, select: { id: true, email: true, name: true, autoArchiveStaleDays: true }, take: 2000 })
  let links = 0, owners = 0, failedEmails = 0
  for (const u of users) {
    if (!u.autoArchiveStaleDays) continue
    try {
      const done = await archiveStaleForUser(u.id, u.autoArchiveStaleDays, now)
      if (!done.length) continue
      owners++; links += done.length
      const { subject, text } = renderAutoArchiveEmail(u.name, done, u.autoArchiveStaleDays, baseUrl)
      if (!(await sendEmail({ to: u.email, subject, text }))) failedEmails++
    } catch (e) {
      console.error('Auto-archive failed for user:', u.id, e)
    }
  }
  return { owners, links, failedEmails }
}
