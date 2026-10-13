import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter } from './aggregate-analytics'

/**
 * Folder performance: human clicks per folder in a workspace over a window versus
 * the window of the same length before it. Links without a folder are reported
 * as the "Unfiled" row (folderId null). Viewers only see folders they can access.
 */
export const FOLDER_WINDOW_OPTIONS = [7, 30, 90] as const
export const FOLDER_DEFAULT_WINDOW = 30
export const FOLDER_MAX_ROWS = 200
const DAY_MS = 86_400_000

export function parseFolderWindow(raw: string | null): number | null {
  if (raw === null || raw === '') return FOLDER_DEFAULT_WINDOW
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (FOLDER_WINDOW_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type FolderStat = {
  folderId: string | null
  name: string
  links: number
  clicks: number
  previousClicks: number
  changePct: number | null
  sharePct: number
}

type RawRow = { folderId: string | null; name: string | null; links: bigint | number; clicks: bigint | number; previous: bigint | number }

export function shapeFolderStats(rows: RawRow[]): FolderStat[] {
  const parsed = rows.map((r) => ({
    folderId: r.folderId,
    name: r.folderId === null ? 'Unfiled' : (r.name ?? 'Untitled folder'),
    links: Number(r.links),
    clicks: Number(r.clicks),
    previousClicks: Number(r.previous),
  }))
  const total = parsed.reduce((s, r) => s + r.clicks, 0)
  return parsed
    .map((r) => ({
      ...r,
      changePct: r.previousClicks > 0 ? Math.round(((r.clicks - r.previousClicks) / r.previousClicks) * 1000) / 10 : null,
      sharePct: total > 0 ? Math.round((r.clicks / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || a.name.localeCompare(b.name) || String(a.folderId).localeCompare(String(b.folderId)))
}

export async function getFolderPerformance(
  workspaceId: string,
  viewer: { userId: string } | undefined,
  days: number,
  now = new Date(),
) {
  const end = now
  const start = new Date(end.getTime() - days * DAY_MS)
  const prevStart = new Date(start.getTime() - days * DAY_MS)
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT u."folderId" AS "folderId", f."name" AS "name", COUNT(DISTINCT u."id") AS "links",
      COUNT(c."id") FILTER (WHERE c."createdAt" >= ${start} AND c."createdAt" < ${end}) AS "clicks",
      COUNT(c."id") FILTER (WHERE c."createdAt" >= ${prevStart} AND c."createdAt" < ${start}) AS "previous"
    FROM "urls" u
    LEFT JOIN "folders" f ON f."id" = u."folderId"
    LEFT JOIN "click_events" c ON c."urlId" = u."id" AND c."trafficType" = 'human' AND c."createdAt" >= ${prevStart} AND c."createdAt" < ${end}
    WHERE ${scopeFilter({ kind: 'workspace', workspaceId, viewer })}
    GROUP BY u."folderId", f."name"
    ORDER BY "clicks" DESC, f."name" ASC NULLS LAST
    LIMIT ${FOLDER_MAX_ROWS}`)
  return { days, from: start.toISOString(), to: end.toISOString(), folders: shapeFolderStats(rows) }
}
