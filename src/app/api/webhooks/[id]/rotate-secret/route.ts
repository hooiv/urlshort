import { NextRequest, NextResponse } from 'next/server';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { WEBHOOK_SCOPES, resolveActor } from '@/lib/request-actor';
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { findManageableEndpoint } from '@/lib/webhook-endpoint-access';
import { buildRotation, parseGraceHours } from '@/lib/webhook-secret-rotation';

/**
 * Rotates the signing secret. The new secret is returned exactly once; the old
 * one keeps co-signing deliveries (extra v1 entry) for `graceHours` (default 24,
 * 0 = revoke immediately) so receivers can deploy the new secret without gaps.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await resolveActor(request, WEBHOOK_SCOPES);
    if (!resolved.actor) return NextResponse.json({ error: resolved.status === 401 ? 'Unauthorized' : resolved.error }, { status: resolved.status });

    const limit = await rateLimit(request, { name: 'webhooks-rotate', limit: 10, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) });

    const { id } = await params;
    const endpoint = await findManageableEndpoint(resolved.actor.userId, id);
    if (!endpoint) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });

    const body: unknown = await request.json().catch(() => ({}));
    const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    const grace = parseGraceHours(input.graceHours);
    if (!grace.ok) return NextResponse.json({ error: grace.error }, { status: 400 });

    const rotation = buildRotation(endpoint.secret, grace.hours);
    // Compare-and-set on the old secret so two concurrent rotations can't both succeed.
    const updated = await prisma.webhookEndpoint.updateMany({ where: { id, secret: endpoint.secret }, data: rotation.data });
    if (updated.count === 0) return NextResponse.json({ error: 'Secret changed concurrently; retry' }, { status: 409 });

    await recordAudit(request, { action: 'webhook.secret_rotated', resourceType: 'webhook', resourceId: id, actorUserId: resolved.actor.userId, metadata: { graceHours: grace.hours } });

    return NextResponse.json({
      id,
      secret: rotation.secret,
      previousSecretExpiresAt: rotation.data.previousSecretExpiresAt,
      graceHours: grace.hours,
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
