import { parseQueryForwarding } from '@/lib/query-forwarding'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { EDIT_ROLES } from '@/lib/workspaces'
import { folderWriteError, visibleUrlWhere } from '@/lib/folders'
import { applyUtmTemplate, normalizeUtmValues, UTM_KEYS, type UtmValues } from '@/lib/utm-templates'
import { invalidateLinks } from '@/lib/link-cache'
import { parseRedirectStatus, assertStatusCompatible } from '@/lib/redirect-status'
import { MAX_DAILY_CLICK_CAP } from '@/lib/daily-click-cap'
import { parseActiveHours } from '@/lib/active-hours'
import { hashGatePassword } from '@/lib/password-gate'
import { validateOgFields } from '@/lib/og-preview'
import { normalizePixelId, PIXEL_PROVIDERS, PixelValidationError, type PixelProvider } from '@/lib/retargeting-pixels'
import { LINK_NOTES_MAX, validateLinkNotes } from '@/lib/link-notes'
import { parseClickIdParam } from '@/lib/click-id-param'
import { parseGeoFence } from '@/lib/geo-fence'
import { parseVisitorBlock } from '@/lib/visitor-block'
import { rewriteDestination, validateRewriteSpec, type RewriteSpec } from '@/lib/destination-rewrite'

export const MAX_BULK_EDIT_LINKS = 500
export const MAX_TAGS_PER_LINK = 20
const TAG = z.string().trim().min(1).max(40)

export const bulkEditSchema = z.object({
  /** Link ids or short codes. */
  links: z.array(z.string().min(1).max(128)).min(1).max(MAX_BULK_EDIT_LINKS),
  /** Validate and return the per-link before/after diff without writing, auditing or invalidating anything. */
  dryRun: z.boolean().optional(),
  changes: z.object({
    addTags: z.array(TAG).max(MAX_TAGS_PER_LINK).optional(),
    removeTags: z.array(TAG).max(MAX_TAGS_PER_LINK).optional(),
    setTags: z.array(TAG).max(MAX_TAGS_PER_LINK).optional(),
    /** null removes the link from its folder. */
    folderId: z.string().min(1).max(64).nullable().optional(),
    /** null clears the expiry. */
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    /** Push each link's existing expiry out by N days (from the later of its expiry and now). Links without an expiry are left alone. */
    extendExpiryDays: z.number().int().min(1).max(3650).optional(),
    /** null clears the go-live time. */
    startsAt: z.string().datetime({ offset: true }).nullable().optional(),
    /** null removes the click limit. */
    maxClicks: z.number().int().min(1).max(1_000_000_000).nullable().optional(),
    /** Max clicks admitted per UTC day; null removes the cap. */
    dailyClickCap: z.number().int().min(1).max(MAX_DAILY_CLICK_CAP).nullable().optional(),
    /** Where visitors land once a link expires or hits its click limit; null clears it. */
    expiredUrl: z.string().trim().url().max(2048).refine((u) => /^https?:\/\//i.test(u), 'expiredUrl must be http(s)').nullable().optional(),
    /** Where visitors land before the link's go-live time; null clears it. */
    notStartedUrl: z.string().trim().url().max(2048).refine((u) => /^https?:\/\//i.test(u), 'notStartedUrl must be http(s)').nullable().optional(),
    /** Country allow/deny list applied to every link; null clears the fence. Validated like the single-link editor. */
    visitorBlock: z.unknown().optional().refine((v) => v === undefined || parseVisitorBlock(v).ok, { message: 'Invalid visitorBlock' }),
    geoFence: z.unknown().optional().refine((v) => v === undefined || parseGeoFence(v).ok, { message: 'Invalid geoFence' }),
    /** Weekly schedule `{ timezone, windows:[{days,start,end}] }` applied to every link, or null to remove it. */
    activeHours: z.unknown().optional().refine((v) => { if (v === undefined) return true; try { return parseActiveHours(v) !== null || v === null } catch { return false } }, { message: 'Invalid activeHours' }),
    /** Where visitors go outside the active hours; null clears it. */
    offHoursUrl: z.string().trim().url().max(2048).refine((u) => /^https?:\/\//i.test(u), 'offHoursUrl must be http(s)').nullable().optional(),
    archived: z.boolean().optional(),
    /** Move the links to the trash (restorable for the retention window). Cannot be combined with other changes. */
    trash: z.literal(true).optional(),
    cloaked: z.boolean().optional(),
    queryForwarding: z.object({ mode: z.enum(['all', 'none', 'allowlist']), allow: z.array(z.string().max(64)).max(25).optional() }).strict().optional(),
    autoFailoverEnabled: z.boolean().optional(),
    /** Pin or unpin the links in the account view (max 20 pinned per account is enforced client-side by ordering). */
    pinned: z.boolean().optional(),
    /** 301/302/307/308; null resets to the 307 default. Permanent codes are refused on links with a password, schedule, click limit or rules. */
    redirectStatus: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).nullable().optional(),
    /** Click-ID passthrough parameter name appended to destinations (e.g. `clickid`); null or empty turns it off. Validated like the single-link editor. */
    clickIdParam: z.string().max(64).nullable().optional(),
    /** Private internal note on every link; null or empty clears it. */
    notes: z.string().max(LINK_NOTES_MAX * 2).nullable().optional().superRefine((v, ctx) => {
      if (typeof v !== 'string') return
      try { validateLinkNotes(v) } catch (e) { ctx.addIssue({ code: 'custom', message: (e as Error).message }) }
    }),
    /** String sets the same gate password on every link; null removes it. Never echoed back or audited. */
    password: z.string().min(4).max(128).nullable().optional(),
    /** Social preview overrides for crawlers; null or empty clears a field. Fields not listed are untouched. Validated like the single-link editor. */
    og: z.object({ title: z.string().max(1000).nullable().optional(), description: z.string().max(2000).nullable().optional(), ogImage: z.string().max(4096).nullable().optional() }).strict().optional(),
    utm: z.object(Object.fromEntries(UTM_KEYS.map((k) => [k, z.string().max(120).nullable().optional()])) as Record<(typeof UTM_KEYS)[number], z.ZodOptional<z.ZodNullable<z.ZodString>>>).optional(),
    utmTemplateId: z.string().min(1).max(64).optional(),
    /** Retargeting pixel ids per provider; null (or empty) clears that provider. Providers not listed are untouched. Ids are format-validated. */
    pixels: z.object(Object.fromEntries(PIXEL_PROVIDERS.map((k) => [k, z.string().max(80).nullable().optional()])) as Record<PixelProvider, z.ZodOptional<z.ZodNullable<z.ZodString>>>).strict().optional(),
    /** Rewrite destinations: swap a hostname, a path prefix, or literal text. Refused for the whole batch if any result is invalid or newly risky. */
    rewriteDestination: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('host'), from: z.string().min(1).max(253), to: z.string().min(1).max(253) }).strict(),
      z.object({ mode: z.literal('prefix'), host: z.string().min(1).max(253).optional(), from: z.string().min(1).max(500), to: z.string().min(1).max(500) }).strict(),
      z.object({ mode: z.literal('text'), find: z.string().min(1).max(500), replace: z.string().max(500) }).strict(),
    ]).optional(),
  }).strict(),
}).superRefine((body, ctx) => {
  const c = body.changes
  if (!Object.values(c).some((v) => v !== undefined)) ctx.addIssue({ code: 'custom', message: 'Choose at least one change' })
  if (c.setTags && (c.addTags || c.removeTags)) ctx.addIssue({ code: 'custom', message: 'setTags cannot be combined with addTags/removeTags' })
  if (c.trash && Object.entries(c).some(([k, v]) => k !== 'trash' && v !== undefined)) ctx.addIssue({ code: 'custom', message: 'trash cannot be combined with other changes' })
  if (c.rewriteDestination) {
    const err = validateRewriteSpec(c.rewriteDestination as RewriteSpec)
    if (err) ctx.addIssue({ code: 'custom', message: err })
    if (c.utm || c.utmTemplateId) ctx.addIssue({ code: 'custom', message: 'rewriteDestination cannot be combined with utm changes' })
  }
  if (c.og) {
    if (!Object.values(c.og).some((v) => v !== undefined)) ctx.addIssue({ code: 'custom', message: 'og needs at least one field' })
    else { try { validateOgFields(c.og) } catch (e) { ctx.addIssue({ code: 'custom', message: (e as Error).message }) } }
  }
  if (c.queryForwarding) {
    try { parseQueryForwarding(c.queryForwarding.mode, c.queryForwarding.allow) } catch (e) { ctx.addIssue({ code: 'custom', message: (e as Error).message }) }
  }
  if (c.pixels) {
    if (!Object.values(c.pixels).some((v) => v !== undefined)) ctx.addIssue({ code: 'custom', message: 'pixels needs at least one provider' })
    for (const k of PIXEL_PROVIDERS) {
      try { normalizePixelId(k, c.pixels[k]) } catch (e) { if (e instanceof PixelValidationError) ctx.addIssue({ code: 'custom', message: e.message }) }
    }
  }
  if (c.clickIdParam !== undefined) {
    try { parseClickIdParam(c.clickIdParam) } catch (e) { ctx.addIssue({ code: 'custom', message: (e as Error).message }) }
  }
  if (c.utm && c.utmTemplateId) ctx.addIssue({ code: 'custom', message: 'Send utm or utmTemplateId, not both' })
  if (c.extendExpiryDays !== undefined && c.expiresAt !== undefined) ctx.addIssue({ code: 'custom', message: 'Send expiresAt or extendExpiryDays, not both' })
  if (c.startsAt && c.expiresAt && new Date(c.startsAt).getTime() >= new Date(c.expiresAt).getTime()) ctx.addIssue({ code: 'custom', message: 'startsAt must be before expiresAt' })
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= Date.now()) ctx.addIssue({ code: 'custom', message: 'expiresAt must be in the future' })
})

export type BulkEditInput = z.infer<typeof bulkEditSchema>
export type BulkEditChanges = BulkEditInput['changes']

export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]
}

/** Pure: the tag list a link ends up with. Throws when it would exceed the per-link cap. */
export function nextTags(current: string[], c: Pick<BulkEditChanges, 'addTags' | 'removeTags' | 'setTags'>): string[] {
  let tags: string[]
  if (c.setTags) tags = normalizeTags(c.setTags)
  else {
    const remove = new Set(normalizeTags(c.removeTags ?? []))
    tags = normalizeTags([...current, ...(c.addTags ?? [])]).filter((t) => !remove.has(t))
  }
  if (tags.length > MAX_TAGS_PER_LINK) throw new Error(`A link can have at most ${MAX_TAGS_PER_LINK} tags`)
  return tags
}

type LinkRow = {
  id: string; shortCode: string; originalUrl: string; tags: string[]; isActive: boolean
  expiresAt: Date | null; startsAt: Date | null; maxClicks: number | null; dailyClickCap: number | null; expiredUrl: string | null; notStartedUrl: string | null; cloaked: boolean; queryForwardMode: string; queryForwardAllow: string[]; autoFailoverEnabled: boolean; metaPixelId: string | null; googleTagId: string | null; xPixelId: string | null; linkedinPartnerId: string | null; tiktokPixelId: string | null; pinterestTagId: string | null; snapPixelId: string | null; redditPixelId: string | null; pinnedAt: Date | null; redirectStatus: number | null; notes: string | null; clickIdParam: string | null; title: string | null; description: string | null; ogImage: string | null; passwordHash: string | null; geoFence: unknown; visitorBlock: unknown; activeHours: unknown; offHoursUrl: string | null; folderId: string | null; workspaceId: string | null; userId: string | null
}

const PIXEL_FIELDS = { meta: 'metaPixelId', google: 'googleTagId', x: 'xPixelId', linkedin: 'linkedinPartnerId', tiktok: 'tiktokPixelId', pinterest: 'pinterestTagId', snapchat: 'snapPixelId', reddit: 'redditPixelId' } as const satisfies Record<PixelProvider, 'metaPixelId' | 'googleTagId' | 'xPixelId' | 'linkedinPartnerId' | 'tiktokPixelId' | 'pinterestTagId' | 'snapPixelId' | 'redditPixelId'>

export type BulkEditFailure = { link: string; reason: string }
export type BulkEditResult =
  | { ok: true; dryRun: boolean; auditEventId?: string; updated: Array<{ id: string; shortCode: string }>; unchanged: number; audit: Array<{ id: string; before: Record<string, unknown>; after: Record<string, unknown> }> }
  | { ok: false; status: 400 | 403 | 404; error: string; failures: BulkEditFailure[] }

/**
 * Applies the same changes to many links atomically: every link is checked
 * first (visibility, edit rights, folder rights, tag cap, UTM template scope)
 * and nothing is written unless every link passes, so a partial edit never
 * leaves a table half-tagged.
 */
export async function applyBulkEdit(userId: string, input: BulkEditInput): Promise<BulkEditResult> {
  const keys = [...new Set(input.links)]
  const c = input.changes
  const rows: LinkRow[] = await prisma.url.findMany({
    where: { AND: [{ deletedAt: null, OR: [{ id: { in: keys } }, { shortCode: { in: keys } }] }, visibleUrlWhere(userId)] },
    select: { id: true, shortCode: true, originalUrl: true, tags: true, isActive: true, expiresAt: true, startsAt: true, maxClicks: true, dailyClickCap: true, expiredUrl: true, notStartedUrl: true, cloaked: true, queryForwardMode: true, queryForwardAllow: true, autoFailoverEnabled: true, metaPixelId: true, googleTagId: true, xPixelId: true, linkedinPartnerId: true, tiktokPixelId: true, pinterestTagId: true, snapPixelId: true, redditPixelId: true, pinnedAt: true, redirectStatus: true, notes: true, clickIdParam: true, title: true, description: true, ogImage: true, passwordHash: true, geoFence: true, visitorBlock: true, activeHours: true, offHoursUrl: true, folderId: true, workspaceId: true, userId: true },
  })
  const found = new Set(rows.flatMap((r) => [r.id, r.shortCode]))
  const failures: BulkEditFailure[] = keys.filter((k) => !found.has(k)).map((link) => ({ link, reason: 'Link not found' }))
  if (failures.length) return { ok: false, status: 404, error: `${failures.length} link(s) not found`, failures }

  const workspaceIds = [...new Set(rows.flatMap((r) => (r.workspaceId ? [r.workspaceId] : [])))]
  const memberships = workspaceIds.length
    ? await prisma.membership.findMany({ where: { userId, workspaceId: { in: workspaceIds } }, select: { workspaceId: true, role: true } })
    : []
  const roles = new Map(memberships.map((m) => [m.workspaceId, m.role]))
  for (const r of rows) {
    const role = r.workspaceId ? roles.get(r.workspaceId) : undefined
    const canEdit = r.workspaceId ? Boolean(role && EDIT_ROLES.includes(role)) : r.userId === userId
    if (!canEdit) failures.push({ link: r.shortCode, reason: 'Editor permission is required' })
  }

  // Destination folder must be writable and in the same workspace as every link.
  if (c.folderId) {
    if (workspaceIds.length !== 1 || rows.some((r) => !r.workspaceId)) {
      return { ok: false, status: 400, error: 'Links must all belong to one workspace to move them into a folder', failures: [] }
    }
    const err = await folderWriteError(userId, workspaceIds[0], roles.get(workspaceIds[0])!, c.folderId)
    if (err) return { ok: false, status: err === 'Folder not found' ? 404 : 403, error: err, failures: [] }
  }

  let utm: UtmValues | null = null
  try {
    if (c.utm) utm = normalizeUtmValues(c.utm)
    else if (c.utmTemplateId) {
      const tpl = await prisma.utmTemplate.findUnique({ where: { id: c.utmTemplateId } })
      if (!tpl || !workspaceIds.includes(tpl.workspaceId) || workspaceIds.length !== 1) {
        return { ok: false, status: 404, error: 'UTM template not found in these links\u2019 workspace', failures: [] }
      }
      utm = normalizeUtmValues(tpl)
    }
  } catch (error) {
    return { ok: false, status: 400, error: (error as Error).message, failures: [] }
  }

  // One scrypt per batch (not per link) keeps a 500-link edit from blocking the event loop.
  const passwordHash = typeof c.password === 'string' ? hashGatePassword(c.password) : null
  const ruleCounts = new Map<string, number>()
  if (c.redirectStatus === 301 || c.redirectStatus === 308) {
    const grouped = await prisma.linkRule.groupBy({ by: ['urlId'], where: { urlId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
    for (const g of grouped) ruleCounts.set(g.urlId, g._count._all)
  }
  const plans: Array<{ row: LinkRow; data: Prisma.UrlUpdateInput; newUrl: string | null; before: Record<string, unknown>; after: Record<string, unknown> }> = []
  for (const r of rows) {
    const data: Prisma.UrlUpdateInput = {}
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    try {
      if (c.addTags || c.removeTags || c.setTags) {
        const tags = nextTags(r.tags, c)
        if (tags.join('\u0000') !== r.tags.join('\u0000')) { data.tags = tags; before.tags = r.tags; after.tags = tags }
      }
    } catch (error) {
      failures.push({ link: r.shortCode, reason: (error as Error).message })
      continue
    }
    if (c.folderId !== undefined && c.folderId !== r.folderId) {
      data.folder = c.folderId ? { connect: { id: c.folderId } } : { disconnect: true }
      before.folderId = r.folderId; after.folderId = c.folderId
    }
    if (c.expiresAt !== undefined) {
      const next = c.expiresAt ? new Date(c.expiresAt) : null
      if ((next?.getTime() ?? null) !== (r.expiresAt?.getTime() ?? null)) { data.expiresAt = next; before.expiresAt = r.expiresAt; after.expiresAt = next }
    }
    if (c.extendExpiryDays !== undefined && r.expiresAt) {
      const base = Math.max(r.expiresAt.getTime(), Date.now())
      const next = new Date(base + c.extendExpiryDays * 86_400_000)
      data.expiresAt = next; before.expiresAt = r.expiresAt; after.expiresAt = next
    }
    if (c.startsAt !== undefined) {
      const next = c.startsAt ? new Date(c.startsAt) : null
      if ((next?.getTime() ?? null) !== (r.startsAt?.getTime() ?? null)) { data.startsAt = next; before.startsAt = r.startsAt; after.startsAt = next }
    }
    {
      const effStart = (data.startsAt !== undefined ? data.startsAt : r.startsAt) as Date | null
      const effEnd = (data.expiresAt !== undefined ? data.expiresAt : r.expiresAt) as Date | null
      if (effStart && effEnd && effStart.getTime() >= effEnd.getTime()) {
        failures.push({ link: r.shortCode, reason: 'startsAt must be before expiresAt' })
        continue
      }
    }
    if (c.maxClicks !== undefined && c.maxClicks !== r.maxClicks) {
      data.maxClicks = c.maxClicks; before.maxClicks = r.maxClicks; after.maxClicks = c.maxClicks
    }
    if (c.dailyClickCap !== undefined && c.dailyClickCap !== r.dailyClickCap) {
      data.dailyClickCap = c.dailyClickCap; before.dailyClickCap = r.dailyClickCap; after.dailyClickCap = c.dailyClickCap
    }
    if (c.expiredUrl !== undefined && c.expiredUrl !== r.expiredUrl) {
      data.expiredUrl = c.expiredUrl; before.expiredUrl = r.expiredUrl; after.expiredUrl = c.expiredUrl
    }
    if (c.notStartedUrl !== undefined && c.notStartedUrl !== r.notStartedUrl) {
      data.notStartedUrl = c.notStartedUrl; before.notStartedUrl = r.notStartedUrl; after.notStartedUrl = c.notStartedUrl
    }
    if (c.autoFailoverEnabled !== undefined && c.autoFailoverEnabled !== r.autoFailoverEnabled) {
      data.autoFailoverEnabled = c.autoFailoverEnabled; before.autoFailoverEnabled = r.autoFailoverEnabled; after.autoFailoverEnabled = c.autoFailoverEnabled
    }
    if (c.cloaked !== undefined && c.cloaked !== r.cloaked) {
      data.cloaked = c.cloaked; before.cloaked = r.cloaked; after.cloaked = c.cloaked
    }
    if (c.queryForwarding) {
      const policy = parseQueryForwarding(c.queryForwarding.mode, c.queryForwarding.allow)
      const same = policy.mode === r.queryForwardMode && policy.allow.length === r.queryForwardAllow.length && policy.allow.every((a, i) => a === r.queryForwardAllow[i])
      if (!same) {
        data.queryForwardMode = policy.mode; data.queryForwardAllow = policy.allow
        before.queryForwarding = { mode: r.queryForwardMode, allow: r.queryForwardAllow }; after.queryForwarding = policy
      }
    }
    if (c.pixels) {
      for (const k of PIXEL_PROVIDERS) {
        if (c.pixels[k] === undefined) continue
        const field = PIXEL_FIELDS[k]
        const next = normalizePixelId(k, c.pixels[k])
        if (next !== r[field]) { data[field] = next; before[field] = r[field]; after[field] = next }
      }
    }
    if (c.pinned !== undefined && c.pinned !== Boolean(r.pinnedAt)) {
      data.pinnedAt = c.pinned ? new Date() : null; before.pinned = Boolean(r.pinnedAt); after.pinned = c.pinned
    }
    if (c.redirectStatus !== undefined) {
      const next = parseRedirectStatus(c.redirectStatus)
      if (next !== (r.redirectStatus ?? null)) { data.redirectStatus = next; before.redirectStatus = r.redirectStatus ?? 307; after.redirectStatus = next ?? 307 }
    }
    if (c.clickIdParam !== undefined) {
      const next = parseClickIdParam(c.clickIdParam)
      if (next !== (r.clickIdParam ?? null)) { data.clickIdParam = next; before.clickIdParam = r.clickIdParam ?? null; after.clickIdParam = next }
    }
    if (c.notes !== undefined) {
      const next = validateLinkNotes(c.notes)
      if (next !== (r.notes ?? null)) { data.notes = next; before.notes = r.notes ?? null; after.notes = next }
    }
    if (c.og) {
      const og = validateOgFields(c.og)
      for (const k of ['title', 'description', 'ogImage'] as const) {
        const next = og[k]
        if (next !== undefined && next !== r[k]) { data[k] = next; before[k] = r[k]; after[k] = next }
      }
    }
    if (c.geoFence !== undefined) {
      const parsed = parseGeoFence(c.geoFence)
      const next = parsed.ok ? parsed.fence : null
      if (JSON.stringify(next) !== JSON.stringify(r.geoFence ?? null)) {
        data.geoFence = next === null ? Prisma.DbNull : (next as unknown as Prisma.InputJsonValue)
        before.geoFence = r.geoFence ?? null; after.geoFence = next
      }
    }
    if (c.visitorBlock !== undefined) {
      const parsed = parseVisitorBlock(c.visitorBlock)
      const next = parsed.ok ? parsed.block : null
      if (JSON.stringify(next) !== JSON.stringify(r.visitorBlock ?? null)) {
        data.visitorBlock = next === null ? Prisma.DbNull : (next as unknown as Prisma.InputJsonValue)
        before.visitorBlock = r.visitorBlock ?? null; after.visitorBlock = next
      }
    }
    if (c.activeHours !== undefined) {
      const next = parseActiveHours(c.activeHours)
      if (JSON.stringify(next) !== JSON.stringify(r.activeHours ?? null)) {
        data.activeHours = next === null ? Prisma.DbNull : (next as unknown as Prisma.InputJsonValue)
        before.activeHours = r.activeHours ?? null; after.activeHours = next
      }
    }
    if (c.offHoursUrl !== undefined && c.offHoursUrl !== r.offHoursUrl) {
      data.offHoursUrl = c.offHoursUrl; before.offHoursUrl = r.offHoursUrl; after.offHoursUrl = c.offHoursUrl
    }
    if (c.password !== undefined) {
      const protectedNow = Boolean(r.passwordHash)
      if (passwordHash) { data.passwordHash = passwordHash; before.passwordProtected = protectedNow; after.passwordProtected = true; after.passwordChanged = true }
      else if (protectedNow) { data.passwordHash = null; before.passwordProtected = true; after.passwordProtected = false }
    }
    if (c.archived !== undefined && c.archived === r.isActive) {
      data.isActive = !c.archived; before.isActive = r.isActive; after.isActive = !c.archived
    }
    if (c.trash) { data.deletedAt = new Date(); before.trashed = false; after.trashed = true }
    if (c.redirectStatus === 301 || c.redirectStatus === 308 || (typeof c.dailyClickCap === 'number' && c.redirectStatus === undefined && (r.redirectStatus === 301 || r.redirectStatus === 308))) {
      try {
        assertStatusCompatible((c.redirectStatus ?? r.redirectStatus) as 301 | 308, {
          hasPassword: (data.passwordHash !== undefined ? data.passwordHash : r.passwordHash) != null,
          hasExpiry: (data.expiresAt !== undefined ? data.expiresAt : r.expiresAt) != null,
          hasStart: (data.startsAt !== undefined ? data.startsAt : r.startsAt) != null,
          hasMaxClicks: (data.maxClicks !== undefined ? data.maxClicks : r.maxClicks) != null,
          hasRules: (ruleCounts.get(r.id) ?? 0) > 0,
          hasDailyCap: (data.dailyClickCap !== undefined ? data.dailyClickCap : r.dailyClickCap) != null,
        })
      } catch (e) {
        failures.push({ link: r.shortCode, reason: (e as Error).message })
      }
    }
    let newUrl: string | null = null
    if (utm) {
      const tagged = applyUtmTemplate(r.originalUrl, utm)
      if (tagged !== r.originalUrl) { newUrl = tagged; data.originalUrl = tagged; before.originalUrl = r.originalUrl; after.originalUrl = tagged }
    }
    if (c.rewriteDestination) {
      const res = rewriteDestination(r.originalUrl, c.rewriteDestination as RewriteSpec)
      if ('error' in res) { failures.push({ link: r.shortCode, reason: res.error }); continue }
      if (res.changed) { newUrl = res.url; data.originalUrl = res.url; before.originalUrl = r.originalUrl; after.originalUrl = res.url }
    }
    if (Object.keys(data).length) plans.push({ row: r, data, newUrl, before, after })
  }
  if (failures.length) return { ok: false, status: 403, error: `${failures.length} link(s) cannot be edited; nothing was changed`, failures }

  if (input.dryRun) {
    return {
      ok: true,
      dryRun: true,
      updated: plans.map((p) => ({ id: p.row.id, shortCode: p.row.shortCode })),
      unchanged: rows.length - plans.length,
      audit: plans.map((p) => ({ id: p.row.id, before: p.before, after: p.after })),
    }
  }

  const now = new Date()
  const auditIds = new Map<string, string>()
  await prisma.$transaction(async (tx) => {
    for (const p of plans) {
      auditIds.set(p.row.id, randomUUID())
      await tx.url.update({ where: { id: p.row.id }, data: p.data, select: { id: true } })
    }
    const revisions = plans.filter((p) => p.newUrl)
    if (revisions.length) {
      await tx.destinationRevision.createMany({
        data: revisions.map((p) => ({ urlId: p.row.id, destinationUrl: p.newUrl!, reason: c.rewriteDestination ? 'Bulk destination rewrite' : 'Bulk UTM edit', effectiveAt: now })),
      })
    }
    await tx.auditEvent.createMany({
      data: plans.map((p) => ({
        id: auditIds.get(p.row.id)!,
        action: 'link.bulk_edit', actorType: 'user', actorUserId: userId, urlId: p.row.id, resourceType: 'url', resourceId: p.row.id,
        beforeJson: JSON.stringify(p.before), afterJson: JSON.stringify(p.after),
        metadataJson: JSON.stringify({ batchSize: rows.length }),
      })),
    })
  }, { timeout: 30_000 })
  await invalidateLinks(plans.map((p) => p.row))
  return {
    ok: true,
    dryRun: false,
    updated: plans.map((p) => ({ id: p.row.id, shortCode: p.row.shortCode })),
    unchanged: rows.length - plans.length,
    auditEventId: plans.length ? auditIds.get(plans[0].row.id) : undefined,
    audit: plans.map((p) => ({ id: p.row.id, before: p.before, after: p.after })),
  }
}
