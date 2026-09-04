import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { assertDestinationSafeForStorage } from '@/lib/destination-health';
import { rateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';

/**
 * Events an endpoint may subscribe to. Keeping this a closed allowlist stops
 * arbitrary strings from being stored (and later silently matching nothing).
 */
export const ALLOWED_EVENTS = new Set([
  'link.clicked',
  'link.created',
  'link.updated',
  'conversion.recorded',
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
});

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        url: true,
        isActive: true,
        events: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { deliveries: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Secrets are signed against (HMAC), never returned after creation. We
    // expose only a short non-reversible-looking hint for UI identification.
    return NextResponse.json(endpoints.map((endpoint) => ({
      id: endpoint.id,
      url: endpoint.url,
      isActive: endpoint.isActive,
      events: endpoint.events,
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
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limit = await rateLimit(request, { name: 'webhooks-create', limit: 30, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const parsed = webhookCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    const { url, events } = parsed.data;

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
        userId: user.id,
        url: normalizedUrl,
        secret,
        events: normalizedEvents,
      },
    });

    // The full secret is returned exactly once, at creation time.
    return NextResponse.json(endpoint, { status: 201 });
  } catch (error) {
    console.error('Create webhook endpoint failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
