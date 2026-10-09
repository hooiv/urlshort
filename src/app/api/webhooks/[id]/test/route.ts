import { NextRequest, NextResponse } from 'next/server';
import { findManageableEndpoint } from '@/lib/webhook-endpoint-access';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { enqueueWebhook, processWebhookDelivery } from '@/lib/webhooks';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limit = await rateLimit(request, { name: 'webhooks-test', limit: 10, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { id } = await params;

    // Personal endpoints: their owner. Workspace endpoints: workspace owners/admins.
    const endpoint = await findManageableEndpoint(user.id, id);
    if (!endpoint) {
      return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });
    }

    const testPayload = {
      test: true,
      message: 'QuickLink Webhook Diagnostic Probe',
      shortCode: 'demo-test',
      destination: 'https://example.com/tested',
      timestamp: new Date().toISOString(),
      simulatedMetrics: {
        latencyMs: 42,
        visitorIdHash: 'simulated_visitor_hash',
        country: 'US',
      },
    };

    const delivery = await enqueueWebhook(endpoint.id, 'diagnostic.test', testPayload);
    const result = await processWebhookDelivery(delivery.id);

    const refreshed = await prisma.webhookDelivery.findUnique({
      where: { id: delivery.id },
    });

    return NextResponse.json({
      success: result.status === 'success',
      attempted: result.attempted,
      deliveryId: delivery.id,
      status: result.status,
      statusCode: result.responseCode,
      latencyMs: result.latencyMs,
      responseSnippet: refreshed?.responseBody?.slice(0, 1000) ?? null,
    });
  } catch (error) {
    console.error('Webhook test error:', error);
    return NextResponse.json({ error: 'Webhook test failed' }, { status: 500 });
  }
}
