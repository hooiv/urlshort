import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { WEBHOOK_SCOPES, resolveActor } from '@/lib/request-actor';
import { rateLimit } from '@/lib/rate-limit';
import { parseLinkFilterInput } from '@/lib/webhook-filters';
import { findManageableEndpoint, resolveEndpointFilter } from '@/lib/webhook-endpoint-access';
import { normalizeEvents } from '../route';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolved = await resolveActor(request, WEBHOOK_SCOPES);
    if (!resolved.actor) return NextResponse.json({ error: resolved.status === 401 ? 'Unauthorized' : resolved.error }, { status: resolved.status });
    const user = { id: resolved.actor.userId };

    const { id } = await params;

    const endpoint = await findManageableEndpoint(user.id, id);
    if (!endpoint) {
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
    const resolved = await resolveActor(request, WEBHOOK_SCOPES);
    if (!resolved.actor) return NextResponse.json({ error: resolved.status === 401 ? 'Unauthorized' : resolved.error }, { status: resolved.status });
    const user = { id: resolved.actor.userId };

    const limit = await rateLimit(request, { name: 'webhooks-update', limit: 60, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { id } = await params;
    const endpoint = await findManageableEndpoint(user.id, id);
    if (!endpoint) {
      return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'JSON object body required' }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const data: { events?: string[]; isActive?: boolean; linkScope?: string; tagFilter?: string[]; urlIdFilter?: string[]; folderIdFilter?: string[] } = {};

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
      const filter = parseLinkFilterInput({ linkScope: input.linkScope, tags: input.tags, shortCodes: input.shortCodes, folderIds: input.folderIds });
      if (!filter.ok) return NextResponse.json({ error: filter.error }, { status: 400 });
      const resolved = await resolveEndpointFilter({ userId: user.id, workspaceId: endpoint.workspaceId }, filter);
      if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });
      Object.assign(data, resolved.value);
    } else if (input.tags !== undefined || input.shortCodes !== undefined || input.folderIds !== undefined) {
      return NextResponse.json({ error: 'Send linkScope together with tags, shortCodes or folderIds' }, { status: 400 });
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    const updated = await prisma.webhookEndpoint.update({
      where: { id },
      data,
      select: { id: true, workspaceId: true, url: true, isActive: true, events: true, linkScope: true, tagFilter: true, urlIdFilter: true, folderIdFilter: true, updatedAt: true },
    });
    return NextResponse.json({
      id: updated.id,
      url: updated.url,
      isActive: updated.isActive,
      events: updated.events,
      linkScope: updated.linkScope,
      workspaceId: updated.workspaceId,
      tags: updated.tagFilter,
      folderIds: updated.folderIdFilter,
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
