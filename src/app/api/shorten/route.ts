import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { generateShortCode, getBaseUrl, isReservedCode, isValidUrl, normalizeUrl } from '@/lib/utils'
import { buildManagementUrl, createManagementToken, hashManagementToken } from '@/lib/management'
import { recordAudit } from '@/lib/audit'
import { getCurrentUser } from '@/lib/auth'
import { EDIT_ROLES } from '@/lib/workspaces'
import { assessDestination } from '@/lib/link-safety'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'
import { rateLimit } from '@/lib/rate-limit'
import { hashGatePassword } from '@/lib/password-gate'
import { getIdempotentResponse, storeIdempotentResponse } from '@/lib/idempotency'
import { publishWorkspaceRoutingConfig } from '@/lib/routing-config'

const CUSTOM_CODE = /^[A-Za-z0-9_-]{3,64}$/
const CODE_COLLISION_RETRIES = 5
const MAX_TAGS = 10
const MAX_SPLIT_VARIANTS = 20

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
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      )
    }

    const body = await request.json()
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
    const customCode = typeof body.customCode === 'string' ? body.customCode.trim() : ''
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : null
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : null
    const ogImage = typeof body.ogImage === 'string' ? body.ogImage.trim() : null
    const tags = normalizeTags(body.tags)
    const rawSplitRules = Array.isArray(body.splitRules) ? body.splitRules.slice(0, MAX_SPLIT_VARIANTS) : []

    if (!rawUrl) return NextResponse.json({ error: 'URL is required' }, { status: 400 })

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
    const user = await getCurrentUser(request)
    const risk = assessDestination(normalizedUrl)
    const requestedWorkspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null
    const membership = user
      ? await prisma.membership.findFirst({
          where: { userId: user.id, ...(requestedWorkspaceId ? { workspaceId: requestedWorkspaceId } : {}) },
          orderBy: { createdAt: 'asc' },
        })
      : null
    if (requestedWorkspaceId && !membership) return NextResponse.json({ error: 'You are not a member of that workspace' }, { status: 403 })
    if (requestedWorkspaceId && membership && !EDIT_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Editor permission is required to create links in this workspace' }, { status: 403 })
    const idempotency = membership?.workspaceId ? await getIdempotentResponse(request, membership.workspaceId, body) : null
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
            originalUrl: normalizedUrl,
            shortCode,
            title: title || null,
            description: description || null,
            ogImage: ogImage || null,
            tags,
            passwordHash: body.password ? hashGatePassword(String(body.password)) : null,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            expiredUrl: body.expiredUrl || null,
            maxClicks: body.maxClicks ? parseInt(body.maxClicks, 10) : null,
            metaPixelId: body.metaPixelId || null,
            googleTagId: body.googleTagId || null,
            xPixelId: body.xPixelId || null,
            cloaked: body.cloaked || false,
            managementTokenHash: hashManagementToken(managementToken),
            userId: user?.id || null,
            workspaceId: membership?.workspaceId || null,
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
    return response
  } catch (error) {
    console.error('Error creating short URL:', error)
    return NextResponse.json({ error: 'Could not create short link' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    // Query params: ?search=<code|title|destination>&tag=<tag>&cursor=<createdAt iso>&take=<1-100>
    const params = request.nextUrl.searchParams
    const search = (params.get('search') || '').trim()
    const tagFilter = (params.get('tag') || '').trim().toLowerCase()
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
          {
            OR: [
              { userId: user.id },
              { workspace: { members: { some: { userId: user.id } } } },
            ],
          },
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
