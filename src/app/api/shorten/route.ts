import { NextRequest, NextResponse } from 'next/server'
import { assertValidWindow, parseStartsAt } from '@/lib/link-schedule'
import { normalizePixelId, PixelValidationError } from '@/lib/retargeting-pixels'
import { folderWriteError, visibleUrlWhere } from '@/lib/folders'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { generateShortCode, getBaseUrl, isReservedCode, isValidUrl, normalizeUrl } from '@/lib/utils'
import { buildManagementUrl, createManagementToken, hashManagementToken } from '@/lib/management'
import { recordAudit } from '@/lib/audit'
import { getCurrentUser } from '@/lib/auth'
import { extractApiKey } from '@/lib/api-keys'
import { LINK_READ_SCOPES, LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { EDIT_ROLES } from '@/lib/workspaces'
import { assessDestination } from '@/lib/link-safety'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { hashGatePassword } from '@/lib/password-gate'
import { getIdempotentResponse, storeIdempotentResponse } from '@/lib/idempotency'
import { publishWorkspaceRoutingConfig } from '@/lib/routing-config'
import { dispatchWebhooksForUrl } from '@/lib/webhooks'
import { invalidateLink } from '@/lib/link-cache'
import { applyUtmTemplate } from '@/lib/utm-templates'

const CUSTOM_CODE = /^[A-Za-z0-9_-]{3,64}$/
const CODE_COLLISION_RETRIES = 5
const MAX_TAGS = 10
const MAX_SPLIT_VARIANTS = 20

export const shortenExtrasSchema = z.object({
  password: z.string().min(1).max(128).optional().nullable(),
  expiresAt: z.string().max(100).optional().nullable(),
  expiredUrl: z.string().trim().max(2048).optional().nullable(),
  startsAt: z.string().max(100).optional().nullable(),
  notStartedUrl: z.string().trim().max(2048).optional().nullable(),
  maxClicks: z.union([z.string(), z.number()]).optional().nullable(),
  ogImage: z.string().trim().max(2048).optional().nullable(),
  metaPixelId: z.string().max(50).optional().nullable(),
  googleTagId: z.string().max(50).optional().nullable(),
  xPixelId: z.string().max(50).optional().nullable(),
  linkedinPartnerId: z.string().max(50).optional().nullable(),
  tiktokPixelId: z.string().max(50).optional().nullable(),
})

export function parseShortenMaxClicks(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null
  const value = typeof input === 'number' ? input : Number(String(input).trim())
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error('Max clicks must be an integer from 0 to 1000000')
  }
  return value
}

export function parseShortenExpiresAt(input: unknown): Date | null {
  if (input === null || input === undefined || input === '') return null
  const parsed = new Date(String(input))
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid expiration date')
  return parsed
}

/** Normalize a tag list: lowercase, dedupe, strip empties, cap length/count. */
function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input
    .map((tag) => String(tag).trim().toLowerCase().slice(0, 32))
    .filter((tag) => /^[a-z0-9][a-z0-9-_ ]{0,31}$/.test(tag)))].slice(0, MAX_TAGS)
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'shorten', limit: 20, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many links created. Please try again shortly.' },
        { status: 429, headers: rateLimitHeaders(limit) },
      )
    }

    const body = await request.json()
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
    const customCode = typeof body.customCode === 'string' ? body.customCode.trim() : ''
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : null
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : null
    const tags = normalizeTags(body.tags)
    const rawSplitRules = Array.isArray(body.splitRules) ? body.splitRules.slice(0, MAX_SPLIT_VARIANTS) : []

    if (!rawUrl) return NextResponse.json({ error: 'URL is required' }, { status: 400 })

    const extras = shortenExtrasSchema.safeParse(body)
    if (!extras.success) {
      return NextResponse.json({ error: extras.error.issues[0]?.message || 'Invalid link options' }, { status: 400 })
    }
    let maxClicks: number | null = null
    let expiresAt: Date | null = null
    let startsAt: Date | null = null
    try {
      maxClicks = parseShortenMaxClicks(extras.data.maxClicks)
      expiresAt = parseShortenExpiresAt(extras.data.expiresAt)
      startsAt = parseStartsAt(extras.data.startsAt)
      assertValidWindow(startsAt, expiresAt)
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid link options' }, { status: 400 })
    }
    const rawPassword = typeof extras.data.password === 'string' ? extras.data.password : null
    if (rawPassword !== null && rawPassword.length > 128) {
      return NextResponse.json({ error: 'Password must be 128 characters or fewer' }, { status: 400 })
    }
    let ogImage: string | null = null
    if (extras.data.ogImage) {
      const candidate = extras.data.ogImage.trim()
      if (candidate && !isValidUrl(candidate)) {
        return NextResponse.json({ error: 'ogImage must be a valid HTTP or HTTPS URL' }, { status: 400 })
      }
      ogImage = candidate || null
    }
    let notStartedUrl: string | null = null
    if (extras.data.notStartedUrl) {
      const candidate = normalizeUrl(extras.data.notStartedUrl.trim())
      if (!isValidUrl(candidate)) {
        return NextResponse.json({ error: 'Not-started URL must be a valid HTTP or HTTPS URL' }, { status: 400 })
      }
      try {
        await assertDestinationSafeForStorage(candidate)
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Pre-launch destination is not allowed' }, { status: 400 })
      }
      notStartedUrl = candidate
    }
    let expiredUrl: string | null = null
    if (extras.data.expiredUrl) {
      const candidate = normalizeUrl(extras.data.expiredUrl.trim())
      if (!isValidUrl(candidate)) {
        return NextResponse.json({ error: 'Expired URL must be a valid HTTP or HTTPS URL' }, { status: 400 })
      }
      try {
        await assertDestinationSafeForStorage(candidate)
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Expired destination is not allowed' },
          { status: 400 },
        )
      }
      expiredUrl = candidate
    }

    const normalizedUrl = normalizeUrl(rawUrl)
    if (!isValidUrl(normalizedUrl)) {
      return NextResponse.json({ error: 'Only HTTP and HTTPS URLs are supported' }, { status: 400 })
    }
    if (customCode && !CUSTOM_CODE.test(customCode)) {
      return NextResponse.json({ error: 'Custom code must be 3–64 letters, numbers, _ or -' }, { status: 400 })
    }
    if (customCode && isReservedCode(customCode)) {
      return NextResponse.json({ error: 'That custom code is reserved' }, { status: 409 })
    }

    // SSRF guard at creation time: reject destinations that resolve to private,
    // link-local (incl. cloud metadata), or loopback addresses.
    try {
      await assertDestinationSafeForStorage(normalizedUrl)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Destination is not allowed' },
        { status: 400 },
      )
    }

    const splitRules: Array<{ destinationUrl: string; weight: number }> = []
    for (const raw of rawSplitRules) {
      if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Invalid A/B variant' }, { status: 400 })
      const item = raw as { url?: unknown; weight?: unknown }
      const destinationUrl = normalizeUrl(String(item.url ?? ''))
      const weight = Number(item.weight ?? 100)
      if (!Number.isInteger(weight) || weight < 0 || weight > 1000) {
        return NextResponse.json({ error: 'A/B variant weight must be an integer from 0 to 1000' }, { status: 400 })
      }
      try {
        await assertDestinationSafeForStorage(destinationUrl)
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'A/B variant destination is not allowed' }, { status: 400 })
      }
      splitRules.push({ destinationUrl, weight })
    }

    const managementToken = createManagementToken()
    // Anonymous creation stays allowed; an API key creates as its owner (links:write).
    let user: { id: string } | null
    if (extractApiKey(request)) {
      const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
      if (!resolved.actor) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
      user = { id: resolved.actor.userId }
    } else {
      user = await getCurrentUser(request)
    }
    const risk = assessDestination(normalizedUrl)
    const requestedFolderId = typeof body.folderId === 'string' && body.folderId ? body.folderId.slice(0, 64) : null
    // A folder implies its workspace, so callers may pass either.
    const folderWorkspaceId = requestedFolderId && typeof body.workspaceId !== 'string'
      ? (await prisma.folder.findUnique({ where: { id: requestedFolderId }, select: { workspaceId: true } }))?.workspaceId ?? null
      : null
    const requestedWorkspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : folderWorkspaceId
    const membership = user
      ? await prisma.membership.findFirst({
          where: { userId: user.id, ...(requestedWorkspaceId ? { workspaceId: requestedWorkspaceId } : {}) },
          orderBy: { createdAt: 'asc' },
        })
      : null
    if (requestedWorkspaceId && !membership) return NextResponse.json({ error: 'You are not a member of that workspace' }, { status: 403 })
    if (requestedWorkspaceId && membership && !EDIT_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Editor permission is required to create links in this workspace' }, { status: 403 })
    if (requestedFolderId) {
      if (!user || !membership) return NextResponse.json({ error: user ? 'Folder not found' : 'Sign in to file links in folders' }, { status: user ? 404 : 401 })
      const folderError = await folderWriteError(user.id, membership.workspaceId, membership.role, requestedFolderId)
      if (folderError) return NextResponse.json({ error: folderError }, { status: folderError === 'Folder not found' ? 404 : 403 })
    }
    // Optional workspace UTM template: fills only the utm_* params the URL doesn't already carry.
    let destinationUrl = normalizedUrl
    if (body.utmTemplateId !== undefined && body.utmTemplateId !== null && body.utmTemplateId !== '') {
      if (typeof body.utmTemplateId !== 'string') return NextResponse.json({ error: 'utmTemplateId must be a string' }, { status: 400 })
      if (!membership) return NextResponse.json({ error: 'Sign in and pick a workspace to use a UTM template' }, { status: 401 })
      const template = await prisma.utmTemplate.findFirst({ where: { id: body.utmTemplateId.slice(0, 64), workspaceId: membership.workspaceId } })
      if (!template) return NextResponse.json({ error: 'UTM template not found in this workspace' }, { status: 404 })
      destinationUrl = applyUtmTemplate(normalizedUrl, template)
      if (destinationUrl.length > 2048) return NextResponse.json({ error: 'Destination URL is too long after applying the UTM template' }, { status: 400 })
    }
    const pixelData: Record<string, string | null> = {}
    try {
      for (const [provider, field] of [['meta', 'metaPixelId'], ['google', 'googleTagId'], ['x', 'xPixelId'], ['linkedin', 'linkedinPartnerId'], ['tiktok', 'tiktokPixelId']] as const) {
        pixelData[field] = normalizePixelId(provider, extras.data[field])
      }
    } catch (err) {
      if (err instanceof PixelValidationError) return NextResponse.json({ error: `${err.message}` }, { status: 400 })
      throw err
    }
    let idempotency: Awaited<ReturnType<typeof getIdempotentResponse>> = null
    try {
      idempotency = membership?.workspaceId ? await getIdempotentResponse(request, membership.workspaceId, body) : null
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Idempotency-Key' }, { status: 400 })
    }
    if (idempotency?.existing) return new NextResponse(idempotency.existing.responseJson, { status: idempotency.existing.responseStatus, headers: { 'Content-Type': 'application/json', 'Idempotent-Replay': 'true' } })

    // Create with retry on short-code collisions (check-then-insert races are
    // expected under concurrency; the unique constraint is the source of truth).
    let created
    for (let attempt = 0; attempt <= CODE_COLLISION_RETRIES; attempt += 1) {
      const shortCode = customCode || generateShortCode()
      if (isReservedCode(shortCode)) continue
      try {
        created = await prisma.url.create({
          data: {
            originalUrl: destinationUrl,
            shortCode,
            title: title || null,
            description: description || null,
            ogImage: ogImage || null,
            tags,
            passwordHash: rawPassword ? hashGatePassword(rawPassword) : null,
            expiresAt,
            expiredUrl,
            startsAt,
            notStartedUrl,
            maxClicks,
            ...pixelData,
            cloaked: body.cloaked === true,
            managementTokenHash: hashManagementToken(managementToken),
            userId: user?.id || null,
            workspaceId: membership?.workspaceId || null,
            folderId: requestedFolderId,
            riskStatus: risk.status,
            riskReason: risk.reason,
            riskCheckedAt: new Date(),
            revisions: {
              create: {
                destinationUrl: normalizedUrl,
                reason: 'Initial destination',
                effectiveAt: new Date(),
              },
            },
            ...(splitRules.length > 0
              ? {
                  rules: {
                    create: splitRules.map((r) => {
                      return {
                        name: 'A/B Split',
                        destinationUrl: r.destinationUrl,
                        weight: r.weight,
                        priority: 50,
                      }
                    })
                  }
                }
              : {}
            ),
          },
        })
        break
      } catch (error) {
        if (isUniqueViolation(error) && !customCode && attempt < CODE_COLLISION_RETRIES) continue
        if (isUniqueViolation(error)) {
          return NextResponse.json({ error: 'That custom code is already taken' }, { status: 409 })
        }
        throw error
      }
    }
    if (!created) return NextResponse.json({ error: 'Could not allocate a short code' }, { status: 503 })
    // A visitor (or the creator's own preview) may have hit this code before
    // it existed; drop the negative entry so the first real click resolves.
    await invalidateLink(created.shortCode, created.id)

    const baseUrl = getBaseUrl()
    const response = NextResponse.json({
      id: created.id,
      originalUrl: created.originalUrl,
      shortCode: created.shortCode,
      shortUrl: `${baseUrl}/${created.shortCode}`,
      managementUrl: buildManagementUrl(baseUrl, created.shortCode, managementToken),
      title: created.title,
      description: created.description,
      ogImage: created.ogImage,
      clicks: created.clicks,
      createdAt: created.createdAt,
    }, { status: 201 })
    if (idempotency) await storeIdempotentResponse({ workspaceId: membership!.workspaceId!, keyHash: idempotency.keyHash, requestHash: idempotency.requestHash, method: request.method, path: request.nextUrl.pathname, status: 201, body: { id: created.id, shortCode: created.shortCode, shortUrl: `${baseUrl}/${created.shortCode}`, managementUrl: buildManagementUrl(baseUrl, created.shortCode, managementToken), title: created.title, description: created.description, ogImage: created.ogImage, clicks: created.clicks, createdAt: created.createdAt } })
    await recordAudit(request, { action: 'link.create', urlId: created.id, resourceType: 'url', resourceId: created.id, after: { shortCode: created.shortCode, originalUrl: created.originalUrl, title: created.title } })
    if (created.workspaceId) await publishWorkspaceRoutingConfig(created.workspaceId)
    await dispatchWebhooksForUrl(created.id, 'link.created', { id: created.id, shortCode: created.shortCode, destinationUrl: created.originalUrl, occurredAt: new Date().toISOString() })
    return response
  } catch (error) {
    console.error('Error creating short URL:', error)
    return NextResponse.json({ error: 'Could not create short link' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveActor(request, LINK_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    const user = { id: resolved.actor.userId }

    // Query params: ?search=<code|title|destination>&tag=<tag>&cursor=<createdAt iso>&take=<1-100>
    const params = request.nextUrl.searchParams
    const search = (params.get('search') || '').trim()
    const tagFilter = (params.get('tag') || '').trim().toLowerCase()
    // ?folder=<id> or ?folder=none for links outside any folder.
    const folderFilter = (params.get('folder') || '').trim().slice(0, 40)
    const take = Math.min(Math.max(Number(params.get('take')) || 25, 1), 100)
    const cursorParam = params.get('cursor')
    const cursor = cursorParam ? new Date(cursorParam) : null
    if (cursorParam && (cursor === null || Number.isNaN(cursor.getTime()))) {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
    }

    const urls = await prisma.url.findMany({
      where: {
        deletedAt: null,
        AND: [
          visibleUrlWhere(user.id),
          ...(folderFilter === 'none' ? [{ folderId: null }] : folderFilter ? [{ folderId: folderFilter }] : []),
          ...(search
            ? [{
                OR: [
                  { shortCode: { contains: search, mode: 'insensitive' as const } },
                  { title: { contains: search, mode: 'insensitive' as const } },
                  { originalUrl: { contains: search, mode: 'insensitive' as const } },
                ],
              }]
            : []),
          ...(tagFilter ? [{ tags: { has: tagFilter } }] : []),
          ...(cursor ? [{ createdAt: { lt: cursor } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      // Fetch one extra row to detect whether a next page exists.
      take: take + 1,
      select: {
        id: true,
        originalUrl: true,
        shortCode: true,
        title: true,
        tags: true,
        workspaceId: true,
        folderId: true,
        clicks: true,
        createdAt: true,
        expiresAt: true,
        isActive: true,
        riskStatus: true,
        healthStatus: true,
        _count: { select: { clickEvents: true, rules: true } },
      },
    })
    const hasMore = urls.length > take
    const page = hasMore ? urls.slice(0, take) : urls
    return NextResponse.json({
      links: page,
      nextCursor: hasMore && page.length ? page[page.length - 1].createdAt.toISOString() : null,
    })
  } catch (error) {
    console.error('Error fetching URLs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
