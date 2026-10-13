import { prisma } from '@/lib/prisma'
import { visibleUrlWhere } from '@/lib/folders'
import { invalidateLink, invalidateLinks } from '@/lib/link-cache'

/**
 * Trash: deleting a link hides it and stops redirects at once, but keeps its
 * analytics, rules and short code for a retention window so a mistaken delete
 * is recoverable. After the window a cron purges it for good.
 */
export const TRASH_RETENTION_DAYS = 30
const DAY_MS = 86_400_000

export type TrashedLink = {
  id: string
  shortCode: string
  originalUrl: string
  clicks: number
  deletedAt: string
  purgesAt: string
  daysLeft: number
}

export function purgeDate(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS)
}

export function toTrashedLink(row: { id: string; shortCode: string; originalUrl: string; clicks: number; deletedAt: Date }, now: Date): TrashedLink {
  const purgesAt = purgeDate(row.deletedAt)
  return {
    id: row.id,
    shortCode: row.shortCode,
    originalUrl: row.originalUrl,
    clicks: row.clicks,
    deletedAt: row.deletedAt.toISOString(),
    purgesAt: purgesAt.toISOString(),
    daysLeft: Math.max(0, Math.ceil((purgesAt.getTime() - now.getTime()) / DAY_MS)),
  }
}

/** Moves a link to the trash. Returns false when it was already there. */
export async function trashLink(link: { id: string; shortCode: string }, now = new Date()): Promise<boolean> {
  const res = await prisma.url.updateMany({ where: { id: link.id, deletedAt: null }, data: { deletedAt: now } })
  if (res.count === 0) return false
  await invalidateLink(link.shortCode, link.id)
  return true
}

/** Brings a trashed link back. Returns false when it was not in the trash or its window passed. */
export async function restoreLink(link: { id: string; shortCode: string }, now = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS)
  const res = await prisma.url.updateMany({ where: { id: link.id, deletedAt: { not: null, gt: cutoff } }, data: { deletedAt: null } })
  if (res.count === 0) return false
  await invalidateLink(link.shortCode, link.id)
  return true
}

/** Trashed links the user could manage, newest deletion first. Account-erasure leftovers have no owner and never show. */
export async function listTrash(userId: string, now = new Date()): Promise<TrashedLink[]> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS)
  const rows = await prisma.url.findMany({
    where: { AND: [{ deletedAt: { not: null, gt: cutoff } }, visibleUrlWhere(userId)] },
    orderBy: { deletedAt: 'desc' },
    take: 200,
    select: { id: true, shortCode: true, originalUrl: true, clicks: true, deletedAt: true },
  })
  return rows.map((r) => toTrashedLink({ ...r, deletedAt: r.deletedAt as Date }, now))
}

/** Hard-deletes links whose retention window has passed (cascades analytics). */
export async function purgeExpiredTrash(now = new Date(), batch = 500): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS)
  const rows = await prisma.url.findMany({ where: { deletedAt: { not: null, lte: cutoff }, userId: { not: null } }, select: { id: true, shortCode: true }, take: batch })
  if (rows.length === 0) return 0
  const res = await prisma.url.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })
  await invalidateLinks(rows)
  return res.count
}
