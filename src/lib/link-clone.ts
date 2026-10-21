import { Prisma } from '@prisma/client'
import type { Url } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { generateShortCode, isReservedCode } from '@/lib/utils'

/**
 * Clone a link: same destination, rules, tags, folder, pixels, schedule, OG and
 * routing settings under a fresh short code. Counters, health state, the
 * management token, public stats sharing and the password are NOT copied: a
 * clone starts clean and never inherits secrets or history.
 */
export const CODE_PATTERN = /^[A-Za-z0-9_-]{3,40}$/
const MAX_CODE_ATTEMPTS = 5

export function validateCloneCode(input: unknown): { ok: true; code: string | null } | { ok: false; error: string } {
  if (input === undefined || input === null || input === '') return { ok: true, code: null }
  if (typeof input !== 'string' || !CODE_PATTERN.test(input)) return { ok: false, error: 'shortCode must be 3-40 letters, digits, "-" or "_"' }
  if (isReservedCode(input)) return { ok: false, error: 'That short code is reserved' }
  return { ok: true, code: input }
}

/** Fields copied verbatim onto the clone. Anything not listed here is deliberately dropped. */
export function cloneUrlData(source: Url, shortCode: string): Prisma.UrlUncheckedCreateInput {
  return {
    shortCode,
    originalUrl: source.originalUrl,
    title: source.title,
    description: source.description,
    ogImage: source.ogImage,
    expiresAt: source.expiresAt,
    expiredUrl: source.expiredUrl,
    startsAt: source.startsAt,
    notStartedUrl: source.notStartedUrl,
    maxClicks: source.maxClicks,
    metaPixelId: source.metaPixelId,
    googleTagId: source.googleTagId,
    xPixelId: source.xPixelId,
    linkedinPartnerId: source.linkedinPartnerId,
    tiktokPixelId: source.tiktokPixelId,
    cloaked: source.cloaked,
    isActive: source.isActive,
    userId: source.userId,
    workspaceId: source.workspaceId,
    folderId: source.folderId,
    deepLinkAppId: source.deepLinkAppId,
    autoFailoverEnabled: source.autoFailoverEnabled,
    tags: source.tags,
    notes: source.notes,
    redirectStatus: source.redirectStatus,
    clickIdParam: source.clickIdParam,
    queryForwardMode: source.queryForwardMode,
    queryForwardAllow: source.queryForwardAllow,
    dailyClickCap: source.dailyClickCap,
    offHoursUrl: source.offHoursUrl,
    geoFence: jsonOrDbNull(source.geoFence),
    activeHours: jsonOrDbNull(source.activeHours),
    visitorBlock: source.visitorBlock === null ? Prisma.DbNull : (source.visitorBlock as Prisma.InputJsonValue),
  }
}

function jsonOrDbNull(v: Prisma.JsonValue | null) {
  return v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue)
}

export class CodeTakenError extends Error {
  constructor() {
    super('Short code already in use')
  }
}

export async function cloneLink(source: Url, requestedCode: string | null, actorUserId: string | null): Promise<{ id: string; shortCode: string; rulesCopied: number }> {
  for (let attempt = 0; attempt < (requestedCode ? 1 : MAX_CODE_ATTEMPTS); attempt++) {
    const shortCode = requestedCode ?? generateShortCode()
    if (!requestedCode && isReservedCode(shortCode)) continue
    try {
      return await prisma.$transaction(async (tx) => {
        const data = cloneUrlData(source, shortCode)
        // The actor owns the copy when the source had no owner (token-managed links).
        if (!data.userId && actorUserId) data.userId = actorUserId
        const created = await tx.url.create({ data, select: { id: true, shortCode: true } })
        const rules = await tx.linkRule.findMany({ where: { urlId: source.id } })
        if (rules.length) {
          await tx.linkRule.createMany({
            data: rules.map((r) => ({
              urlId: created.id,
              name: r.name,
              destinationUrl: r.destinationUrl,
              priority: r.priority,
              weight: r.weight,
              enabled: r.enabled,
              countryCodes: r.countryCodes,
              deviceType: r.deviceType,
              trafficType: r.trafficType,
              aiAgent: r.aiAgent,
              os: r.os,
              languageCodes: r.languageCodes,
              referrerDomain: r.referrerDomain,
              startAt: r.startAt,
              endAt: r.endAt,
              schedule: r.schedule,
            })),
          })
        }
        return { id: created.id, shortCode: created.shortCode, rulesCopied: rules.length }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue
      throw error
    }
  }
  throw new CodeTakenError()
}

export const BULK_CLONE_MAX = 50

/** Validate a bulk-clone body: 1..50 unique, well-formed short codes. */
export function validateBulkCloneCodes(input: unknown): { ok: true; codes: string[] } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Invalid JSON body' }
  const codes = (input as { codes?: unknown }).codes
  if (!Array.isArray(codes) || codes.length === 0) return { ok: false, error: 'codes must be a non-empty array' }
  if (codes.length > BULK_CLONE_MAX) return { ok: false, error: `At most ${BULK_CLONE_MAX} links per request` }
  const seen = new Set<string>()
  for (const c of codes) {
    if (typeof c !== 'string' || !CODE_PATTERN.test(c)) return { ok: false, error: 'Every code must be 3-40 letters, digits, "-" or "_"' }
    seen.add(c)
  }
  return { ok: true, codes: [...seen] }
}
