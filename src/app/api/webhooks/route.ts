import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { WEBHOOK_SCOPES, resolveActor } from '@/lib/request-actor';
import { assertDestinationSafeForStorage } from '@/lib/destination-health';
import { rateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';
import { parseLinkFilterInput } from '@/lib/webhook-filters';
import { isWorkspaceAdmin, manageableEndpointWhere, resolveEndpointFilter } from '@/lib/webhook-endpoint-access';

/**
 * Events an endpoint may subscribe to. Keeping this a closed allowlist stops
 * arbitrary strings from being stored (and later silently matching nothing).
 */
export const ALLOWED_EVENTS = new Set([
  'link.clicked',
  'link.created',
  'link.updated',
  'conversion.recorded',
  'conversion.refunded',
  'diagnostic.test',
]);

const LEGACY_EVENT_ALIASES: Record<string, string> = {
  click: 'link.clicked',
};

export function normalizeEvents(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? [input] : ['link.clicked'];
  const events = raw
    .map((event) => String(event).trim())
    .filter((event): event is string => event.length > 0)
    .map((event) => LEGACY_EVENT_ALIASES[event] ?? event);
  for (const event of events) {
    if (!ALLOWED_EVENTS.has(event)) throw new Error(`Unsupported webhook event: ${event.slice(0, 64)}`);
  }
  const unique = [...new Set(events)];
  if (unique.length === 0) throw new Error('At least one webhook event is required');
  if (unique.length > 10) throw new Error('Too many webhook events (max 10)');
  return unique;
}

export const webhookCreateSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  events: z.array(z.string().trim().min(1).max(64)).min(1).max(10).optional(),
  linkScope: z.unknown().optional(),
  tags: z.unknown().optional(),
  shortCodes: z.unknown().optional(),
  folderIds: z.unknown().optional(),
  /** Create a workspace endpoint (owner/admin) that fires for every workspace link. */
  workspaceId: z.string().min(1).max(64).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveActor(request, WEBHOOK_SCOPES);
    if (!resolved.actor) return NextResponse.json({ error: resolved.status === 401 ? 'Unauthorized' : resolved.error }, { status: resolved.status });
    const user = { id: resolved.actor.userId };

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: await manageableEndpointWhere(user.id),
      select: {
        id: true,
        workspaceId: true,
        workspace: { select: { name: true } },
        url: true,
        isActive: true,
        events: true,
        linkScope: true,
        tagFilter: true,
        urlIdFilter: true,
        folderIdFilter: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { deliveries: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const filteredIds = [...new Set(endpoints.flatMap((endpoint) => endpoint.urlIdFilter))];
    const shortCodeById = new Map(
      filteredIds.length
        ? (await prisma.url.findMany({ where: { id: { in: filteredIds } }, select: { id: true, shortCode: true } }))
            .map((link) => [link.id, link.shortCode])
        : [],
    );

    // Secrets are signed against (HMAC), never returned after creation. We
    // expose only a short non-reversible-looking hint for UI identification.
    return NextResponse.json(endpoints.map((endpoint) => ({
      id: endpoint.id,
      workspaceId: endpoint.workspaceId,
      workspaceName: endpoint.workspace?.name ?? null,
      url: endpoint.url,
      isActive: endpoint.isActive,
      events: endpoint.events,
      linkScope: endpoint.linkScope,
      tags: endpoint.tagFilter,
      folderIds: endpoint.folderIdFilter,
      shortCodes: endpoint.urlIdFilter.map((id) => shortCodeById.get(id)).filter((code): code is string => !!code),
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
      deliveriesCount: endpoint._count.deliveries,
      secretHint: '••••••••',
    })));
  } catch (error) {
    console.error('List webhook endpoints failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveActor(request, WEBHOOK_SCOPES);
    if (!resolved.actor) return NextResponse.json({ error: resolved.status === 401 ? 'Unauthorized' : resolved.error }, { status: resolved.status });
    const user = { id: resolved.actor.userId };

    const limit = await rateLimit(request, { name: 'webhooks-create', limit: 30, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const parsed = webhookCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    const { url, events } = parsed.data;

    const workspaceId = parsed.data.workspaceId ?? null;
    if (workspaceId && !(await isWorkspaceAdmin(user.id, workspaceId))) {
      return NextResponse.json({ error: 'Only workspace owners and admins can add workspace webhooks' }, { status: 403 });
    }
    const filter = parseLinkFilterInput(parsed.data);
    if (!filter.ok) return NextResponse.json({ error: filter.error }, { status: 400 });
    const resolvedFilter = await resolveEndpointFilter({ userId: user.id, workspaceId }, filter);
    if (!resolvedFilter.ok) return NextResponse.json({ error: resolvedFilter.error }, { status: 400 });

    let normalizedEvents: string[];
    try {
      normalizedEvents = normalizeEvents(events);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid events' }, { status: 400 });
    }

    // SSRF guard, same policy as link destinations: HTTPS only, public DNS
    // resolution only. Without this a user could make our servers deliver
    // signed POSTs to internal services or cloud metadata endpoints.
    let normalizedUrl: string;
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'https:') throw new Error('Webhook URLs must use HTTPS');
      await assertDestinationSafeForStorage(parsed.toString());
      normalizedUrl = parsed.toString();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid webhook URL';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const secret = crypto.randomBytes(24).toString('hex');

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        // Exactly one owner: a workspace endpoint has no user, so it survives the creator leaving.
        userId: workspaceId ? null : user.id,
        workspaceId,
        url: normalizedUrl,
        secret,
        events: normalizedEvents,
        ...resolvedFilter.value,
      },
    });

    // The full secret is returned exactly once, at creation time.
    return NextResponse.json(endpoint, { status: 201 });
  } catch (error) {
    console.error('Create webhook endpoint failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
