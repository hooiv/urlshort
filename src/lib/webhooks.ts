import { prisma } from './prisma';
import crypto from 'crypto';
import { randomUUID } from 'node:crypto';
import { assertDestinationSafeForStorage } from './destination-health';
import { reserveUsageInTransaction } from './tenant-usage';
import { CircuitBreaker } from './resilience';

export const WEBHOOK_MAX_RETRIES = 5;
const webhookCircuits = new Map<string, CircuitBreaker>();
function circuitFor(endpointId:string){let c=webhookCircuits.get(endpointId);if(!c){c=new CircuitBreaker(5,30_000);webhookCircuits.set(endpointId,c)}return c}

/**
 * Exponential backoff between delivery attempts: 5m, 25m, ~2h, ~10h, ~52h.
 * Pure so it stays unit-testable and consistent across workers.
 */
export function webhookBackoffMs(attempt: number): number {
  return Math.pow(5, Math.max(1, attempt)) * 60_000;
}

/**
 * Tenant scoping for webhook fan-out: an event on a URL may only reach
 * endpoints owned by the same workspace or the same user. Both ids are
 * optional; a condition is emitted only for present ids so we never match
 * NULL-ownership rows belonging to other tenants.
 */
export function webhookEndpointScope(
  owner: { workspaceId: string | null; userId: string | null }
): ({ workspaceId: string } | { userId: string })[] | undefined {
  if (owner.workspaceId && owner.userId) {
    return [{ workspaceId: owner.workspaceId }, { userId: owner.userId }];
  }
  if (owner.workspaceId) return [{ workspaceId: owner.workspaceId }];
  if (owner.userId) return [{ userId: owner.userId }];
  return undefined;
}

export type WebhookDeliveryResult = {
  /** False when the delivery was skipped (already succeeded, endpoint disabled, or claimed by another worker). */
  attempted: boolean
  status: 'success' | 'failed' | 'pending' | null
  responseCode: number | null
  latencyMs: number
}

export async function enqueueWebhook(
  endpointId: string,
  event: string,
  payload: Record<string, unknown>
) {
  const delivery = await prisma.$transaction(async tx => {
    const endpointOwner = await tx.webhookEndpoint.findUnique({ where: { id: endpointId }, select: { workspaceId: true } })
    if (!endpointOwner) throw new Error('Webhook endpoint not found')
    if (endpointOwner.workspaceId) {
      const quota = await reserveUsageInTransaction(tx, endpointOwner.workspaceId, 'webhook_deliveries')
      if (!quota.allowed) throw new Error('Webhook delivery quota exceeded')
    }
    return tx.webhookDelivery.create({
      data: {
        endpointId,
        event,
        payload: JSON.stringify(payload),
        status: 'pending',
        nextAttemptAt: new Date(),
      },
    })
  });

  // Ideally this would be pushed to a message broker (SQS/Kafka) or triggered asynchronously
  // For this V1, we'll process it in-line synchronously or just rely on a cron
  return delivery;
}

export async function processWebhookDelivery(deliveryId: string): Promise<WebhookDeliveryResult> {
  const skipped: WebhookDeliveryResult = { attempted: false, status: null, responseCode: null, latencyMs: 0 };

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });

  if (!delivery || delivery.status === 'success' || !delivery.endpoint.isActive) return skipped;

  const endpoint = delivery.endpoint;
  const circuit = circuitFor(endpoint.id);
  if (!circuit.canRequest()) return { ...skipped, status: 'pending' }; 
  // DNS can change between endpoint creation and delivery. Revalidate on every
  // attempt so a once-public hostname cannot later turn the webhook worker into
  // an SSRF primitive.
  try {
    await assertDestinationSafeForStorage(endpoint.url);
  } catch (error) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'failed',
        responseBody: error instanceof Error ? error.message.slice(0, 1000) : 'Webhook destination rejected',
        lastAttemptAt: new Date(),
        nextAttemptAt: null,
      },
    });
    return { attempted: false, status: 'failed', responseCode: null, latencyMs: 0 };
  }
  const payloadStr = delivery.payload;
  
  // Generate HMAC signature
  const signature = generateWebhookSignature(payloadStr, endpoint.secret);

  const currentAttempt = delivery.attempts + 1;

  // Atomic claim: only the worker that flips `attempts` from its read value
  // may deliver. Concurrent cron invocations (multi-instance deploys, manual
  // retries) observe count === 0 and skip instead of double-posting.
  const leaseToken = randomUUID();
  const leaseUntil = new Date(Date.now() + 30_000);
  const claimed = await prisma.webhookDelivery.updateMany({ where: { id: delivery.id, attempts: delivery.attempts, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] }, data: { attempts: currentAttempt, leaseToken, leaseUntil } });
  if (claimed.count === 0) return skipped;

  let status: 'success' | 'failed' | 'pending' = 'pending';
  let responseCode = null;
  let responseBody = null;
  
  const startedAt = Date.now();
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
      status = currentAttempt >= WEBHOOK_MAX_RETRIES ? 'failed' : 'pending';
    }
  } catch (error: unknown) {
    status = currentAttempt >= WEBHOOK_MAX_RETRIES ? 'failed' : 'pending';
    responseBody = error instanceof Error ? error.message : 'Webhook delivery failed';
  }
  const latencyMs = Date.now() - startedAt;

  // Exponential backoff if retrying
  let nextAttemptAt = null;
  if (status === 'pending') {
    nextAttemptAt = new Date(Date.now() + webhookBackoffMs(currentAttempt));
  }

  // A worker may outlive its lease (for example during a stalled network
  // request). Never let that stale worker overwrite a newer worker's result.
  const finalized = await prisma.webhookDelivery.updateMany({
    where: { id: delivery.id, leaseToken },
    data: {
      status,
      responseCode,
      responseBody: responseBody ? responseBody.substring(0, 1000) : null,
      lastAttemptAt: new Date(),
      nextAttemptAt,
      leaseToken: null,
      leaseUntil: null,
    },
  });
  if (finalized.count !== 1) return skipped;

  return { attempted: true, status, responseCode, latencyMs };
}

// DLQ processor that finds pending webhooks whose nextAttemptAt is in the past
export async function processDeadLetterQueue() {
  const pending = await prisma.webhookDelivery.findMany({
    where: {
      status: 'pending',
      OR: [{ nextAttemptAt: { lte: new Date() } }, { leaseUntil: { lte: new Date() } }],
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

export async function dispatchWebhooksForUrl(
  urlId: string,
  event: string,
  payload: Record<string, unknown>
) {
  const url = await prisma.url.findUnique({
    where: { id: urlId },
    select: { workspaceId: true, userId: true },
  });
  if (!url) return;

  // Security-critical: scope strictly to the owning workspace/user. A naive
  // `{ workspaceId: { not: null } }`-style filter here would fan this link's
  // click payloads out to every other tenant's endpoints.
  const scope = webhookEndpointScope(url);
  if (!scope) return;

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      isActive: true,
      OR: scope,
      events: {
        has: event
      }
    },
    select: { id: true },
  });

  await Promise.allSettled(endpoints.map((endpoint) => enqueueWebhook(endpoint.id, event, payload)));
}

export function generateWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function __resetWebhookResilienceForTests() {
  webhookCircuits.clear()
}

export function verifyWebhookSignature(payload: string, secret: string, signature: string): boolean {
  if (!payload || !secret || !signature) return false;
  try {
    const expected = generateWebhookSignature(payload, secret);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

