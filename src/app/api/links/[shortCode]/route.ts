import { validateLinkNotes } from '@/lib/link-notes'
import { trashLink, TRASH_RETENTION_DAYS } from '@/lib/link-trash'
import { validateOgFields } from '@/lib/og-preview'
import { assertValidWindow, parseStartsAt } from '@/lib/link-schedule'
import { publishWorkspaceRoutingConfig } from '@/lib/routing-config'
import { normalizePixelId, PixelValidationError, type PixelProvider } from '@/lib/retargeting-pixels';
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { getManageableUrl } from '@/lib/authorization'
import { normalizeSafeUrl } from '@/lib/smart-routing'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'
import { invalidateLink } from '@/lib/link-cache'
import { hashGatePassword } from '@/lib/password-gate'

type UrlRow = NonNullable<Awaited<ReturnType<typeof getManageableUrl>>['url']>

const MAX_TAGS = 10

const PIXEL_FIELDS: Array<[PixelProvider, 'metaPixelId' | 'googleTagId' | 'xPixelId' | 'linkedinPartnerId' | 'tiktokPixelId']> = [['meta', 'metaPixelId'], ['google', 'googleTagId'], ['x', 'xPixelId'], ['linkedin', 'linkedinPartnerId'], ['tiktok', 'tiktokPixelId']];

export function parseMaxClicks(input: unknown): number | null {
  if (input === null || input === '' || input === undefined) return null
  const value = typeof input === 'number' ? input : Number(String(input).trim())
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error('Max clicks must be an integer from 0 to 1000000')
  }
  return value
}

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input
    .map((tag) => String(tag).trim().toLowerCase().slice(0, 32))
    .filter((tag) => /^[a-z0-9][a-z0-9-_ ]{0,31}$/.test(tag)))].slice(0, MAX_TAGS)
}

async function authorize(request: NextRequest, shortCode: string, includeTrashed = false): Promise<{ url: UrlRow } | { response: NextResponse }> {
  const access = await getManageableUrl(request, shortCode, undefined, { includeTrashed })
  if (!access.url) return { response: NextResponse.json({ error: access.error }, { status: access.status }) }
  return { url: access.url }
}

export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const auth = await authorize(request, shortCode)
  if ('response' in auth) return auth.response
  const link = auth.url
  const url = await prisma.url.findUnique({
    where: { id: link.id },
    select: {
      id: true, originalUrl: true, shortCode: true, title: true, description: true, ogImage: true, notes: true, tags: true, clicks: true,
      createdAt: true, updatedAt: true, expiresAt: true, expiredUrl: true, startsAt: true, notStartedUrl: true, passwordHash: true, metaPixelId: true, googleTagId: true, xPixelId: true, linkedinPartnerId: true, tiktokPixelId: true, cloaked: true, webhookUrl: true, maxClicks: true, isActive: true,
      riskStatus: true, healthStatus: true,
      deepLinkApp: { select: { id: true, name: true, environment: true, appVersion: true, minimumAppVersion: true, enabled: true, resolverEnabled: true } },
      _count: { select: { clickEvents: true, rules: true, goals: true, revisions: true } },
    },
  })
  if (!url) return NextResponse.json({ error: 'URL not found' }, { status: 404 })
  return NextResponse.json(url)
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const auth = await authorize(request, shortCode)
  if ('response' in auth) return auth.response
  const link = auth.url

  try {
    const body = (await request.json()) as Record<string, unknown>
    const data: Record<string, unknown> = {}

    Object.assign(data, validateOgFields({ title: body.title, description: body.description, ogImage: body.ogImage }))

    if (body.notes !== undefined) data.notes = validateLinkNotes(body.notes)

    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive)
    }
    if (body.deepLinkAppId !== undefined) {
      if (body.deepLinkAppId === null || body.deepLinkAppId === '') {
        data.deepLinkAppId = null
      } else {
        if (!link.workspaceId) throw new Error('A workspace link is required for native deep links')
        const app = await prisma.deepLinkApp.findFirst({where:{id:String(body.deepLinkAppId),workspaceId:link.workspaceId}})
        if (!app) throw new Error('Deep-link app not found in this workspace')
        data.deepLinkAppId = app.id
      }
    }
    if (body.cloaked !== undefined) {
      data.cloaked = Boolean(body.cloaked)
    }

    if (body.tags !== undefined) {
      data.tags = normalizeTags(body.tags)
    }

    if (body.expiresAt !== undefined) {
      if (body.expiresAt === null) {
        data.expiresAt = null
      } else {
        const parsed = new Date(String(body.expiresAt))
        if (Number.isNaN(parsed.getTime())) throw new Error('Invalid expiration date')
        data.expiresAt = parsed
      }
    }
    
    if (body.startsAt !== undefined) data.startsAt = parseStartsAt(body.startsAt)
    if (body.notStartedUrl !== undefined) {
      if (body.notStartedUrl === null || body.notStartedUrl === '') {
        data.notStartedUrl = null
      } else {
        const parsed = normalizeSafeUrl(String(body.notStartedUrl))
        await assertDestinationSafeForStorage(parsed)
        data.notStartedUrl = parsed
      }
    }
    if (body.startsAt !== undefined || body.expiresAt !== undefined) {
      assertValidWindow(
        (data.startsAt !== undefined ? data.startsAt : link.startsAt) as Date | null,
        (data.expiresAt !== undefined ? data.expiresAt : link.expiresAt) as Date | null,
      )
    }

    if (body.expiredUrl !== undefined) {
      if (body.expiredUrl === null || body.expiredUrl === '') {
        data.expiredUrl = null
      } else {
        const parsed = normalizeSafeUrl(String(body.expiredUrl))
        // SSRF guard: expired fallback is a redirect target, same as creation.
        await assertDestinationSafeForStorage(parsed)
        data.expiredUrl = parsed
      }
    }

    if (body.password !== undefined) {
      if (body.password === null || body.password === '') {
        data.passwordHash = null
      } else {
        data.passwordHash = hashGatePassword(String(body.password));
      }
    }
    
    for (const [provider, field] of PIXEL_FIELDS) {
      if (body[field] === undefined) continue;
      try {
        data[field] = normalizePixelId(provider, body[field]);
      } catch (err) {
        if (err instanceof PixelValidationError) {
          return NextResponse.json({ error: `${field} ${err.message}` }, { status: 400 });
        }
        throw err;
      }
    }
    if (body.webhookUrl !== undefined) {
      if (body.webhookUrl === null || body.webhookUrl === '') {
        data.webhookUrl = null;
      } else {
        const parsed = normalizeSafeUrl(String(body.webhookUrl));
        // The redirect path performs a server-side POST to this legacy
        // endpoint. Validate its resolved address at write time so a caller
        // cannot turn link clicks into SSRF after the URL is stored.
        await assertDestinationSafeForStorage(parsed)
        data.webhookUrl = parsed;
      }
    }
    if (body.maxClicks !== undefined) {
      data.maxClicks = parseMaxClicks(body.maxClicks)
    }

    // Changing the fallback destination creates a revision (append-only history).
    let newDestination: string | null = null
    if (body.destinationUrl !== undefined) {
      newDestination = normalizeSafeUrl(String(body.destinationUrl ?? ''))
      await assertDestinationSafeForStorage(newDestination)
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (newDestination && newDestination !== link.originalUrl) {
        await tx.destinationRevision.create({
          data: { urlId: link.id, destinationUrl: newDestination, reason: 'Fallback destination updated', effectiveAt: new Date() },
        })
        data.originalUrl = newDestination
      }
      return tx.url.update({ where: { id: link.id }, data, select: { id: true, originalUrl: true, shortCode: true, title: true, description: true, ogImage: true, notes: true, tags: true, isActive: true, expiresAt: true, expiredUrl: true, startsAt: true, notStartedUrl: true, metaPixelId: true, googleTagId: true, xPixelId: true, linkedinPartnerId: true, tiktokPixelId: true, cloaked: true, webhookUrl: true, maxClicks: true, updatedAt: true } })
    })

    await invalidateLink(updated.shortCode, updated.id)
    if (link.workspaceId) await publishWorkspaceRoutingConfig(link.workspaceId)
    await recordAudit(request, {
      action: 'link.update',
      urlId: updated.id,
      resourceType: 'url',
      resourceId: updated.id,
      before: { title: link.title, isActive: link.isActive, expiresAt: link.expiresAt },
      after: { title: updated.title, isActive: updated.isActive, expiresAt: updated.expiresAt, destinationChanged: Boolean(newDestination) },
    })
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update link' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const permanent = request.nextUrl.searchParams.get('permanent') === 'true'
  const auth = await authorize(request, shortCode, permanent)
  if ('response' in auth) return auth.response
  const link = auth.url

  try {
    // Default: move to the trash (restorable for 30 days). ?permanent=true erases now.
    if (permanent) {
      const deleted = await prisma.url.delete({ where: { id: link.id }, select: { id: true, shortCode: true } })
      await invalidateLink(link.shortCode, link.id)
      await recordAudit(request, { action: 'link.delete', urlId: link.id, resourceType: 'url', resourceId: link.id, after: { shortCode: link.shortCode, permanent: true } })
      return NextResponse.json({ deleted: true, permanent: true, shortCode: deleted.shortCode })
    }
    await trashLink(link)
    await recordAudit(request, { action: 'link.trash', urlId: link.id, resourceType: 'url', resourceId: link.id, after: { shortCode: link.shortCode } })
    return NextResponse.json({ deleted: true, permanent: false, shortCode: link.shortCode, restorableDays: TRASH_RETENTION_DAYS })
  } catch (error) {
    console.error('Link deletion failed:', error)
    return NextResponse.json({ error: 'Could not delete link' }, { status: 500 })
  }
}
