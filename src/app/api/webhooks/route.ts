import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { assertDestinationSafeForStorage } from '@/lib/destination-health';
import crypto from 'crypto';

/**
 * Events an endpoint may subscribe to. Keeping this a closed allowlist stops
 * arbitrary strings from being stored (and later silently matching nothing).
 */
const ALLOWED_EVENTS = new Set([
  'link.clicked',
  'link.created',
  'link.updated',
  'conversion.recorded',
  'diagnostic.test',
]);

function normalizeEvents(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? [input] : ['click'];
  const events = raw
    .map((event) => String(event).trim())
    .filter((event): event is string => event.length > 0)
    .map((event) => (ALLOWED_EVENTS.has(event) ? event : 'link.clicked'));
  return [...new Set(events)];
}

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
      orderBy: { createdAt: 'desc' }
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

    const json = await request.json();
    const { url, events } = json as Record<string, unknown>;

    if (typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
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
        secretPrefix: secret.slice(0, 8),
        events: normalizeEvents(events),
      },
    });

    // The full secret is returned exactly once, at creation time.
    return NextResponse.json(endpoint, { status: 201 });
  } catch (error) {
    console.error('Create webhook endpoint failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
