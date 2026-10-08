import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { parseLinkFilterInput } from '@/lib/webhook-filters';
import { resolveOwnedLinkIds } from '@/lib/webhook-link-resolution';
import { normalizeEvents } from '../route';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!endpoint || endpoint.userId !== user.id) {
      return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });
    }

    await prisma.webhookEndpoint.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Partial update: events, active flag, and link filter. The filter fields are
 * replaced as a unit when `linkScope` is present so an endpoint can never be
 * left with a scope whose filter list belongs to a previous scope.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limit = await rateLimit(request, { name: 'webhooks-update', limit: 60, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { id } = await params;
    const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!endpoint || endpoint.userId !== user.id) {
      return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'JSON object body required' }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const data: { events?: string[]; isActive?: boolean; linkScope?: string; tagFilter?: string[]; urlIdFilter?: string[] } = {};

    if (input.events !== undefined) {
      try {
        data.events = normalizeEvents(input.events);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid events' }, { status: 400 });
      }
    }
    if (input.isActive !== undefined) {
      if (typeof input.isActive !== 'boolean') return NextResponse.json({ error: 'isActive must be a boolean' }, { status: 400 });
      data.isActive = input.isActive;
    }
    if (input.linkScope !== undefined) {
      const filter = parseLinkFilterInput({ linkScope: input.linkScope, tags: input.tags, shortCodes: input.shortCodes });
      if (!filter.ok) return NextResponse.json({ error: filter.error }, { status: 400 });
      let urlIdFilter: string[] = [];
      if (filter.linkScope === 'links') {
        const resolved = await resolveOwnedLinkIds(user.id, filter.shortCodes);
        if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });
        urlIdFilter = resolved.ids;
      }
      data.linkScope = filter.linkScope;
      data.tagFilter = filter.tagFilter;
      data.urlIdFilter = urlIdFilter;
    } else if (input.tags !== undefined || input.shortCodes !== undefined) {
      return NextResponse.json({ error: 'Send linkScope together with tags or shortCodes' }, { status: 400 });
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    const updated = await prisma.webhookEndpoint.update({
      where: { id },
      data,
      select: { id: true, url: true, isActive: true, events: true, linkScope: true, tagFilter: true, urlIdFilter: true, updatedAt: true },
    });
    return NextResponse.json({
      id: updated.id,
      url: updated.url,
      isActive: updated.isActive,
      events: updated.events,
      linkScope: updated.linkScope,
      tags: updated.tagFilter,
      shortCodes: updated.urlIdFilter.length
        ? (await prisma.url.findMany({ where: { id: { in: updated.urlIdFilter } }, select: { shortCode: true } })).map((link) => link.shortCode)
        : [],
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error('Update webhook endpoint failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
