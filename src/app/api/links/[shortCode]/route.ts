import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { getManageableUrl } from '@/lib/authorization'
import { normalizeSafeUrl } from '@/lib/smart-routing'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'
import { invalidateLink } from '@/lib/link-cache'

type UrlRow = NonNullable<Awaited<ReturnType<typeof getManageableUrl>>['url']>

const MAX_TAGS = 10

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input
    .map((tag) => String(tag).trim().toLowerCase().slice(0, 32))
    .filter((tag) => /^[a-z0-9][a-z0-9-_ ]{0,31}$/.test(tag)))].slice(0, MAX_TAGS)
}

async function authorize(request: NextRequest, shortCode: string): Promise<{ url: UrlRow } | { response: NextResponse }> {
  const access = await getManageableUrl(request, shortCode)
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
      id: true, originalUrl: true, shortCode: true, title: true, description: true, ogImage: true, tags: true, clicks: true,
      createdAt: true, updatedAt: true, expiresAt: true, expiredUrl: true, passwordHash: true, metaPixelId: true, googleTagId: true, xPixelId: true, cloaked: true, webhookUrl: true, maxClicks: true, isActive: true,
      riskStatus: true, healthStatus: true,
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

    if (body.title !== undefined) {
      data.title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) || null : null
    }
    if (body.description !== undefined) {
      data.description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) || null : null
    }
    if (body.ogImage !== undefined) {
      data.ogImage = typeof body.ogImage === 'string' ? body.ogImage.trim() || null : null
    }

    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive)
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
    
    if (body.expiredUrl !== undefined) {
      if (body.expiredUrl === null || body.expiredUrl === '') {
        data.expiredUrl = null
      } else {
        const parsed = normalizeSafeUrl(String(body.expiredUrl))
        data.expiredUrl = parsed
      }
    }

    if (body.password !== undefined) {
      if (body.password === null || body.password === '') {
        data.passwordHash = null
      } else {
        const crypto = await import('node:crypto');
        data.passwordHash = crypto.scryptSync(String(body.password), 'ql_salt', 64).toString('hex');
      }
    }
    
    if (body.metaPixelId !== undefined) {
      data.metaPixelId = typeof body.metaPixelId === 'string' ? body.metaPixelId.trim().slice(0, 50) || null : null;
    }
    if (body.googleTagId !== undefined) {
      data.googleTagId = typeof body.googleTagId === 'string' ? body.googleTagId.trim().slice(0, 50) || null : null;
    }
    if (body.xPixelId !== undefined) {
      data.xPixelId = typeof body.xPixelId === 'string' ? body.xPixelId.trim().slice(0, 50) || null : null;
    }
    if (body.webhookUrl !== undefined) {
      if (body.webhookUrl === null || body.webhookUrl === '') {
        data.webhookUrl = null;
      } else {
        const parsed = normalizeSafeUrl(String(body.webhookUrl));
        data.webhookUrl = parsed;
      }
    }
    if (body.maxClicks !== undefined) {
      data.maxClicks = body.maxClicks === null || body.maxClicks === '' ? null : Number(body.maxClicks);
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
      return tx.url.update({ where: { id: link.id }, data, select: { id: true, originalUrl: true, shortCode: true, title: true, description: true, ogImage: true, tags: true, isActive: true, expiresAt: true, expiredUrl: true, metaPixelId: true, googleTagId: true, xPixelId: true, cloaked: true, webhookUrl: true, maxClicks: true, updatedAt: true } })
    })

    invalidateLink(updated.shortCode, updated.id)
    await recordAudit(request, {
      action: 'link.update',
      urlId: updated.id,
      resourceType: 'url',
      resourceId: updated.id,
      before: { title: link.title, isActive: link.isActive },
      after: { title: updated.title, isActive: updated.isActive, expiresAt: updated.expiresAt, destinationChanged: Boolean(newDestination) },
    })
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update link' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const auth = await authorize(request, shortCode)
  if ('response' in auth) return auth.response
  const link = auth.url

  try {
    // Hard delete the link and all associated analytics via cascading foreign keys
    const deleted = await prisma.url.delete({
      where: { id: link.id },
      select: { id: true, shortCode: true },
    })

    invalidateLink(link.shortCode, link.id)
    await recordAudit(request, { action: 'link.delete', urlId: link.id, resourceType: 'url', resourceId: link.id, after: { shortCode: link.shortCode } })
    return NextResponse.json({ deleted: true, shortCode: deleted.shortCode })
  } catch (error) {
    console.error('Link deletion failed:', error)
    return NextResponse.json({ error: 'Could not delete link' }, { status: 500 })
  }
}
