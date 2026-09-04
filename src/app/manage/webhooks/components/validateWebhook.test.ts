import { describe, expect, it } from 'vitest';
import { DEFAULT_WEBHOOK_EVENTS, getWebhookUrlError } from './validateWebhook';

describe('getWebhookUrlError', () => {
  it('requires a URL', () => {
    expect(getWebhookUrlError('')).toBe('URL is required');
    expect(getWebhookUrlError('   ')).toBe('URL is required');
  });

  it('accepts well-formed HTTPS endpoints', () => {
    expect(getWebhookUrlError('https://api.yourdomain.com/webhooks/quicklink')).toBeNull();
  });

  it('rejects plain HTTP, matching the server HTTPS-only SSRF guard', () => {
    expect(getWebhookUrlError('http://api.yourdomain.com/hook')).toBe('Webhook URLs must use HTTPS');
  });

  it('rejects malformed and non-URL input instead of letting the server 400 silently', () => {
    expect(getWebhookUrlError('not a url')).not.toBeNull();
    expect(getWebhookUrlError('https://')).not.toBeNull();
  });
});

describe('DEFAULT_WEBHOOK_EVENTS', () => {
  it('uses allowlisted event names the server stores verbatim', () => {
    expect(DEFAULT_WEBHOOK_EVENTS).toEqual(['link.clicked', 'conversion.recorded']);
  });
});
