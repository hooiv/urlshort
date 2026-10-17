import { prisma } from './prisma';
import crypto from 'crypto';
import { randomUUID } from 'node:crypto';
import { assertDestinationSafeForStorage } from './destination-health';
import { reserveUsageInTransaction } from './tenant-usage';
import { CircuitBreaker } from './resilience';
import { isSlackWebhookUrl, slackBodyForDelivery } from './slack-format';
import { endpointMatchesLink, signWebhookPayloadMulti } from './webhook-filters';
import { activeWebhookSecrets } from './webhook-secret-rotation';

import { evaluateEndpointHealth } from './webhook-health';
export const WEBHOOK_MAX_RETRIES = 5;
const RESPONSE_BODY_LIMIT = 1000;

/** Reads at most `limit` characters of a response body, then cancels the stream. */
export async function readCappedText(res: Response, limit: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (text.length < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text.slice(0, limit);
}
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
  payload: Record<string, unknown> | string,
  options: { replayOfId?: string } = {}
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
        // A replay passes the original string so the body is byte-identical.
        payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
        status: 'pending',
        nextAttemptAt: new Date(),
        replayOfId: options.replayOfId ?? null,
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
  const isSlack = isSlackWebhookUrl(endpoint.url);
  const payloadStr = isSlack ? slackBodyForDelivery(delivery.event, delivery.payload) : delivery.payload;
  
  // Legacy body-only signature is kept for existing consumers; the
  // timestamped v1 signature lets receivers reject replayed deliveries.
  const signature = generateWebhookSignature(payloadStr, endpoint.secret);
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const timestampedSignature = signWebhookPayloadMulti(payloadStr, activeWebhookSecrets(endpoint), timestampSeconds);

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
      headers: isSlack ? { 'Content-Type': 'application/json' } : {
        'Content-Type': 'application/json',
        'X-QuickLink-Signature': signature,
        'X-QuickLink-Signature-256': timestampedSignature,
        'X-QuickLink-Timestamp': String(timestampSeconds),
        'X-QuickLink-Event': delivery.event,
        'X-QuickLink-Delivery': delivery.id,
      },
      body: payloadStr,
      // 5 second timeout
      signal: AbortSignal.timeout(5000),
      // Never follow redirects: the destination was only vetted for SSRF at
      // its own address, and a 3xx could point at internal infrastructure.
      redirect: 'manual',
    });

    responseCode = res.status;
    // Bounded read: a receiver can't make the worker buffer an unbounded body.
    responseBody = await readCappedText(res, RESPONSE_BODY_LIMIT).catch(() => null);
    if (res.status >= 300 && res.status < 400) responseBody = `Redirect (${res.status}) not followed; point the webhook at the final URL`;

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
      latencyMs,
      leaseToken: null,
      leaseUntil: null,
    },
  });
  if (finalized.count !== 1) return skipped;

  if (status === 'failed') await evaluateEndpointHealth(endpoint.id).catch((e) => console.error('[webhook] health check failed', e));

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

export type WebhookFanoutItem = { urlId: string; payload: Record<string, unknown> }

type FanoutEndpoint = {
  id: string
  workspaceId: string | null
  userId: string | null
  linkScope: string
  tagFilter: string[]
  urlIdFilter: string[]
  folderIdFilter?: string[]
}

type FanoutLink = { id: string; workspaceId: string | null; userId: string | null; tags: string[]; folderId?: string | null }

/**
 * Pure matcher: which endpoint should receive which item. An endpoint is only
 * eligible for a link owned by the same workspace or the same user (tenant
 * isolation), and then only if its link filter accepts the link.
 */
export function planWebhookFanout(
  items: WebhookFanoutItem[],
  links: Map<string, FanoutLink>,
  endpoints: FanoutEndpoint[],
): { endpointId: string; workspaceId: string | null; payload: Record<string, unknown> }[] {
  const planned: { endpointId: string; workspaceId: string | null; payload: Record<string, unknown> }[] = []
  for (const item of items) {
    const link = links.get(item.urlId)
    if (!link) continue
    for (const endpoint of endpoints) {
      // A workspace endpoint serves that workspace's links; a personal one
      // serves its owner's links. Never both, so ownership can't be widened.
      const sameTenant = endpoint.workspaceId !== null
        ? endpoint.workspaceId === link.workspaceId
        : endpoint.userId !== null && endpoint.userId === link.userId
      if (!sameTenant || !endpointMatchesLink(endpoint, link)) continue
      planned.push({ endpointId: endpoint.id, workspaceId: endpoint.workspaceId, payload: item.payload })
    }
  }
  return planned
}

/**
 * Fans one event out for many links with a constant number of queries
 * (links, endpoints, one insert transaction) instead of three round-trips per
 * item. A 1,000-click batch previously cost ~3,000 queries here.
 */
export async function dispatchWebhooksForUrls(event: string, items: WebhookFanoutItem[]): Promise<{ enqueued: number; droppedForQuota: number }> {
  if (items.length === 0) return { enqueued: 0, droppedForQuota: 0 }
  const urlIds = [...new Set(items.map(item => item.urlId))]
  const links = await prisma.url.findMany({
    where: { id: { in: urlIds } },
    select: { id: true, workspaceId: true, userId: true, tags: true, folderId: true },
  })
  const linkMap = new Map(links.map(link => [link.id, link]))

  const workspaceIds = [...new Set(links.map(l => l.workspaceId).filter((id): id is string => !!id))]
  const userIds = [...new Set(links.map(l => l.userId).filter((id): id is string => !!id))]
  // Security-critical: only ever query endpoints of the owners we just read.
  // An empty owner set must short-circuit; `OR: []` would match nothing in
  // Prisma, but being explicit keeps the intent obvious.
  const ownerScope = [
    ...(workspaceIds.length ? [{ workspaceId: { in: workspaceIds } }] : []),
    ...(userIds.length ? [{ userId: { in: userIds } }] : []),
  ]
  if (ownerScope.length === 0) return { enqueued: 0, droppedForQuota: 0 }

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { isActive: true, events: { has: event }, OR: ownerScope },
    select: { id: true, workspaceId: true, userId: true, linkScope: true, tagFilter: true, urlIdFilter: true, folderIdFilter: true },
  })
  if (endpoints.length === 0) return { enqueued: 0, droppedForQuota: 0 }

  const planned = planWebhookFanout(items, linkMap, endpoints)
  if (planned.length === 0) return { enqueued: 0, droppedForQuota: 0 }

  const perWorkspace = new Map<string, number>()
  for (const p of planned) if (p.workspaceId) perWorkspace.set(p.workspaceId, (perWorkspace.get(p.workspaceId) ?? 0) + 1)

  return prisma.$transaction(async tx => {
    const blocked = new Set<string>()
    // Sorted to take tenant quota row locks in a stable order across workers (deadlock avoidance).
    for (const workspaceId of [...perWorkspace.keys()].sort()) {
      const quota = await reserveUsageInTransaction(tx, workspaceId, 'webhook_deliveries', BigInt(perWorkspace.get(workspaceId)!))
      if (!quota.allowed) blocked.add(workspaceId)
    }
    const admitted = planned.filter(p => !p.workspaceId || !blocked.has(p.workspaceId))
    if (admitted.length > 0) {
      const now = new Date()
      await tx.webhookDelivery.createMany({
        data: admitted.map(p => ({ endpointId: p.endpointId, event, payload: JSON.stringify(p.payload), status: 'pending' as const, nextAttemptAt: now })),
      })
    }
    return { enqueued: admitted.length, droppedForQuota: planned.length - admitted.length }
  })
}

export async function dispatchWebhooksForUrl(
  urlId: string,
  event: string,
  payload: Record<string, unknown>
) {
  await dispatchWebhooksForUrls(event, [{ urlId, payload }])
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

