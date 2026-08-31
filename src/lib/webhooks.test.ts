import { describe, it, expect } from 'vitest';
import { generateWebhookSignature, verifyWebhookSignature } from './webhooks';

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
    expect(sig1.length).toBe(64); // 32 bytes in hex = 64 chars
  });

  it('successfully verifies genuine signature', () => {
    const sig = generateWebhookSignature(samplePayload, secret);
    const isValid = verifyWebhookSignature(samplePayload, secret, sig);
    expect(isValid).toBe(true);
  });

  it('rejects tampered payload', () => {
    const sig = generateWebhookSignature(samplePayload, secret);
    const tampered = JSON.stringify({ ...JSON.parse(samplePayload), event: 'tampered' });
    const isValid = verifyWebhookSignature(tampered, secret, sig);
    expect(isValid).toBe(false);
  });

  it('rejects wrong secret', () => {
    const sig = generateWebhookSignature(samplePayload, secret);
    const isValid = verifyWebhookSignature(samplePayload, 'wrong_secret', sig);
    expect(isValid).toBe(false);
  });

  it('handles empty or malformed inputs defensively', () => {
    expect(verifyWebhookSignature('', secret, 'sig')).toBe(false);
    expect(verifyWebhookSignature(samplePayload, '', 'sig')).toBe(false);
    expect(verifyWebhookSignature(samplePayload, secret, '')).toBe(false);
    expect(verifyWebhookSignature(samplePayload, secret, 'invalid_hex_string_zzz')).toBe(false);
  });
});
