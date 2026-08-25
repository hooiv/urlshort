import { prisma } from './prisma';
import crypto from 'crypto';

export async function enqueueWebhook(
  endpointId: string,
  event: string,
  payload: Record<string, unknown>
) {
  const delivery = await prisma.webhookDelivery.create({
    data: {
      endpointId,
      event,
      payload: JSON.stringify(payload),
      status: 'pending',
      nextAttemptAt: new Date(),
    },
  });
  
  // Ideally this would be pushed to a message broker (SQS/Kafka) or triggered asynchronously
  // For this V1, we'll process it in-line synchronously or just rely on a cron
  return delivery;
}

export async function processWebhookDelivery(deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });

  if (!delivery || delivery.status === 'success' || !delivery.endpoint.isActive) return;

  const endpoint = delivery.endpoint;
  const payloadStr = delivery.payload;
  
  // Generate HMAC signature
  const signature = crypto
    .createHmac('sha256', endpoint.secret)
    .update(payloadStr)
    .digest('hex');

  const MAX_RETRIES = 5;
  const currentAttempt = delivery.attempts + 1;
  let status: 'success' | 'failed' | 'pending' = 'pending';
  let responseCode = null;
  let responseBody = null;
  
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-QuickLink-Signature': signature,
        'X-QuickLink-Event': delivery.event,
        'X-QuickLink-Delivery': delivery.id,
      },
      body: payloadStr,
      // 5 second timeout
      signal: AbortSignal.timeout(5000),
    });

    responseCode = res.status;
    responseBody = await res.text().catch(() => null);

    if (res.ok) {
      status = 'success';
    } else {
      status = currentAttempt >= MAX_RETRIES ? 'failed' : 'pending';
    }
  } catch (error: any) {
    status = currentAttempt >= MAX_RETRIES ? 'failed' : 'pending';
    responseBody = error.message;
  }

  // Calculate exponential backoff (e.g. 1m, 5m, 25m, 2h, etc) if pending
  let nextAttemptAt = null;
  if (status === 'pending') {
    const backoffMs = Math.pow(5, currentAttempt) * 60 * 1000; 
    nextAttemptAt = new Date(Date.now() + backoffMs);
  }

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status,
      responseCode,
      responseBody: responseBody ? responseBody.substring(0, 1000) : null,
      attempts: currentAttempt,
      lastAttemptAt: new Date(),
      nextAttemptAt,
    },
  });

  return status;
}

// DLQ processor that finds pending webhooks whose nextAttemptAt is in the past
export async function processDeadLetterQueue() {
  const pending = await prisma.webhookDelivery.findMany({
    where: {
      status: 'pending',
      nextAttemptAt: {
        lte: new Date(),
      },
    },
    take: 100,
    orderBy: { nextAttemptAt: 'asc' },
  });

  const results = await Promise.allSettled(
    pending.map(p => processWebhookDelivery(p.id))
  );
  
  return {
    processed: pending.length,
    successes: results.filter(r => r.status === 'fulfilled').length,
  };
}
