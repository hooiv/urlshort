import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { enqueueWebhook, processWebhookDelivery } from '@/lib/webhooks';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    // Strict ownership: the endpoint must belong to the caller. Unlike a
    // `userId && userId !== user.id` check, orphaned (workspace-only) rows
    // can never be probed by arbitrary users.
    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!endpoint || endpoint.userId !== user.id) {
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
      responseSnippet: refreshed?.responseBody,
    });
  } catch (error) {
    console.error('Webhook test error:', error);
    const message = error instanceof Error ? error.message : 'Webhook test failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
