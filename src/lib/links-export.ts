import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'
import { serializeCsv } from './csv'
import { neutralizeFormula } from './analytics-export'

/**
 * Link inventory export (Bitly/Dub "export links"): every non-trashed link in
 * a scope as CSV or JSON. The CSV header matches what /api/bulk imports, so a
 * round trip between workspaces works. Capped so a request cannot pull an
 * unbounded table into memory. JSON also carries routing/pixel config so a
 * workspace can be fully backed up; CSV stays the importable core columns.
 */
export const LINKS_EXPORT_MAX = 50_000
export const LINKS_EXPORT_FORMATS = ['csv', 'json'] as const
export type LinksExportFormat = (typeof LINKS_EXPORT_FORMATS)[number]

export type ExportedLink = {
  shortCode: string
  originalUrl: string
  title: string | null
  tags: string[]
  folderId: string | null
  clicks: number
  isActive: boolean
  passwordProtected: boolean
  createdAt: string
  startsAt: string | null
  expiresAt: string | null
  maxClicks: number | null
  expiredUrl: string | null
  notStartedUrl: string | null
  redirectStatus: number | null
  dailyClickCap: number | null
  notes: string | null
  cloaked: boolean
  queryForwardMode: string | null
  clickIdParam: string | null
  metaPixelId: string | null
  googleTagId: string | null
  xPixelId: string | null
  linkedinPartnerId: string | null
  tiktokPixelId: string | null
  pinterestTagId: string | null
  snapPixelId: string | null
  redditPixelId: string | null; uetTagId: string | null
  geoFence: unknown
  visitorBlock: unknown
  activeHours: unknown
  offHoursUrl: string | null
}

type Row = Omit<ExportedLink, 'createdAt' | 'startsAt' | 'expiresAt' | 'passwordProtected'> & {
  passwordHash: string | null
  createdAt: Date
  startsAt: Date | null
  expiresAt: Date | null
  maxClicks: number | null
  expiredUrl: string | null
  notStartedUrl: string | null
  redirectStatus: number | null
  dailyClickCap: number | null
  notes: string | null
}

export function parseExportFormat(raw: string | null): LinksExportFormat | null {
  if (raw === null || raw === '') return 'csv'
  return (LINKS_EXPORT_FORMATS as readonly string[]).includes(raw) ? (raw as LinksExportFormat) : null
}

export function toExportedLink(r: Row): ExportedLink {
  return {
    shortCode: r.shortCode, originalUrl: r.originalUrl, title: r.title, tags: r.tags ?? [], folderId: r.folderId,
    clicks: r.clicks, isActive: r.isActive, passwordProtected: r.passwordHash !== null,
    createdAt: r.createdAt.toISOString(), startsAt: r.startsAt?.toISOString() ?? null, expiresAt: r.expiresAt?.toISOString() ?? null,
    maxClicks: r.maxClicks ?? null, expiredUrl: r.expiredUrl ?? null, notStartedUrl: r.notStartedUrl ?? null,
    redirectStatus: r.redirectStatus ?? null, dailyClickCap: r.dailyClickCap ?? null, notes: r.notes ?? null,
    cloaked: r.cloaked ?? false, queryForwardMode: r.queryForwardMode ?? null, clickIdParam: r.clickIdParam ?? null,
    metaPixelId: r.metaPixelId ?? null, googleTagId: r.googleTagId ?? null, xPixelId: r.xPixelId ?? null,
    linkedinPartnerId: r.linkedinPartnerId ?? null, tiktokPixelId: r.tiktokPixelId ?? null, pinterestTagId: r.pinterestTagId ?? null, snapPixelId: r.snapPixelId ?? null, redditPixelId: r.redditPixelId ?? null, uetTagId: r.uetTagId ?? null,
    geoFence: r.geoFence ?? null, visitorBlock: r.visitorBlock ?? null, activeHours: r.activeHours ?? null, offHoursUrl: r.offHoursUrl ?? null,
  }
}

const CSV_HEADER = ['shortCode', 'originalUrl', 'title', 'tags', 'folderId', 'clicks', 'active', 'passwordProtected', 'createdAt', 'startsAt', 'expiresAt', 'maxClicks', 'expiredUrl', 'notStartedUrl', 'redirectStatus', 'dailyClickCap', 'notes']

export function linksToCsv(links: ExportedLink[]): string {
  const safe = (v: string | null) => (v == null ? '' : neutralizeFormula(v))
  return serializeCsv([
    CSV_HEADER,
    ...links.map((l) => [l.shortCode, l.originalUrl, safe(l.title), l.tags.map(neutralizeFormula).join(';'), l.folderId ?? '', l.clicks, l.isActive, l.passwordProtected, l.createdAt, l.startsAt ?? '', l.expiresAt ?? '', l.maxClicks ?? '', l.expiredUrl ?? '', l.notStartedUrl ?? '', l.redirectStatus ?? '', l.dailyClickCap ?? '', safe(l.notes)]),
  ])
}

export async function exportLinks(scope: AnalyticsScope): Promise<{ links: ExportedLink[]; truncated: boolean }> {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT u."shortCode", u."originalUrl", u."title", u."tags", u."folderId", u."clicks", u."isActive",
           u."passwordHash", u."createdAt", u."startsAt", u."expiresAt", u."maxClicks", u."expiredUrl", u."notStartedUrl", u."redirectStatus", u."dailyClickCap", u."notes",
           u."cloaked", u."queryForwardMode", u."clickIdParam", u."metaPixelId", u."googleTagId", u."xPixelId", u."linkedinPartnerId", u."tiktokPixelId", u."pinterestTagId", u."snapPixelId", u."redditPixelId", u."uetTagId",
           u."geoFence", u."visitorBlock", u."activeHours", u."offHoursUrl"
    FROM "urls" u
    WHERE ${scopeFilter(scope)}
    ORDER BY u."createdAt" DESC, u."id"
    LIMIT ${LINKS_EXPORT_MAX + 1}`)
  const truncated = rows.length > LINKS_EXPORT_MAX
  return { links: (truncated ? rows.slice(0, LINKS_EXPORT_MAX) : rows).map(toExportedLink), truncated }
}
