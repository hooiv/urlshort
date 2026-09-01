import { describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  webhookDelivery: { findUnique: vi.fn(), updateMany: vi.fn() },
}));

vi.mock('./prisma', () => ({ prisma: prismaMock }));
vi.mock('./destination-health', () => ({ assertDestinationSafeForStorage: vi.fn().mockResolvedValue(undefined) }));

import { generateWebhookSignature, verifyWebhookSignature, processWebhookDelivery } from './webhooks';

describe('Webhooks Security & Signatures', () => {
  const secret = 'sec_live_test_secret_1234567890abcdef';
  const samplePayload = JSON.stringify({
    event: 'link.clicked',
    timestamp: '2026-08-26T18:00:00.000Z',
    data: { shortCode: 'launch-test', clicks: 100 },
  });

  it('generates consistent HMAC-SHA256 signature', () => {
    const sig1 = generateWebhookSignature(samplePayload, secret);
    const sig2 = generateWebhookSignature(samplePayload, secret);
    expect(sig1).toBe(sig2);
    expect(typeof sig1).toBe('string');
    expect(sig1.length).toBe(64);
  });

  it('successfully verifies genuine signature', () => {
    const sig = generateWebhookSignature(samplePayload, secret);
    expect(verifyWebhookSignature(samplePayload, secret, sig)).toBe(true);
  });

  it('rejects tampered payload', () => {
    const sig = generateWebhookSignature(samplePayload, secret);
    const tampered = JSON.stringify({ ...JSON.parse(samplePayload), event: 'tampered' });
    expect(verifyWebhookSignature(tampered, secret, sig)).toBe(false);
  });

  it('rejects wrong secret', () => {
    const sig = generateWebhookSignature(samplePayload, secret);
    expect(verifyWebhookSignature(samplePayload, 'wrong_secret', sig)).toBe(false);
  });

  it('handles empty or malformed inputs defensively', () => {
    expect(verifyWebhookSignature('', secret, 'sig')).toBe(false);
    expect(verifyWebhookSignature(samplePayload, '', 'sig')).toBe(false);
    expect(verifyWebhookSignature(samplePayload, secret, '')).toBe(false);
    expect(verifyWebhookSignature(samplePayload, secret, 'invalid_hex_string_zzz')).toBe(false);
  });

  it('does not let a stale worker finalize a delivery after its lease is reclaimed', async () => {
    const delivery = {
      id: 'delivery-1', attempts: 0, status: 'pending',
      payload: samplePayload, endpoint: { url: 'https://webhook.example.test/hook', secret, isActive: true },
    };
    prismaMock.webhookDelivery.findUnique.mockResolvedValue(delivery);
    let updateCount = 0;
    prismaMock.webhookDelivery.updateMany.mockImplementation(async () => {
      updateCount += 1;
      if (updateCount === 1 || updateCount === 2) return { count: 1 };
      if (updateCount === 3) return { count: 1 };
      return { count: 0 };
    });

    let releaseFirst!: () => void;
    const firstStarted = new Promise<void>(resolve => { releaseFirst = resolve; });
    let fetchCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      fetchCount += 1;
      if (fetchCount === 1) await firstStarted;
      return new Response('ok', { status: 200 });
    });
    try {
      const first = processWebhookDelivery(delivery.id);
      await vi.waitFor(() => expect(fetchCount).toBe(1));
      const second = processWebhookDelivery(delivery.id);
      await vi.waitFor(() => expect(fetchCount).toBe(2));
      releaseFirst();
      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult.attempted).toBe(false);
      expect(secondResult.attempted).toBe(true);
      expect(secondResult.status).toBe('success');
      expect(prismaMock.webhookDelivery.updateMany).toHaveBeenCalledTimes(4);
      const staleFinalize = prismaMock.webhookDelivery.updateMany.mock.calls[3][0];
      expect(staleFinalize.where).toEqual(expect.objectContaining({ id: delivery.id }));
      expect(typeof staleFinalize.where.leaseToken).toBe('string');
    } finally {
      globalThis.fetch = originalFetch;
      vi.clearAllMocks();
    }
  });
});
