import { useCallback, useEffect, useState } from 'react';
import type { Webhook } from './types';
import { DEFAULT_WEBHOOK_EVENTS, getWebhookUrlError } from './validateWebhook';

type RawWebhook = {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  deliveries?: number;
  deliveriesCount?: number;
  secretHint?: string;
  secret?: string;
  _count?: { deliveries: number };
};

/**
 * Normalize the endpoint payload. The list endpoint exposes the delivery
 * total as `deliveriesCount` (plus `updatedAt`/`secretHint`), while older
 * shapes nested it under `_count.deliveries` — accept both so the count
 * never silently renders as 0.
 */
function normalizeWebhook(raw: RawWebhook): Webhook {
  const deliveries =
    typeof raw.deliveriesCount === 'number'
      ? raw.deliveriesCount
      : typeof raw.deliveries === 'number'
        ? raw.deliveries
        : raw._count?.deliveries ?? 0;
  return {
    id: raw.id,
    url: raw.url,
    events: Array.isArray(raw.events) ? raw.events : [],
    isActive: raw.isActive,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    deliveries,
    secretHint: raw.secretHint,
  };
}

/**
 * Owns webhook-endpoint fetching and mutations.
 *
 * Fixes vs the previous inline implementation: the list fetch is tied to an
 * AbortController, list-fetch failures are surfaced, adds validate the URL
 * client-side and surface server rejections (previously a 400 did nothing),
 * the creation secret (returned exactly once by the API) is exposed instead
 * of discarded, and deletes roll back when the API call fails.
 */
export function useWebhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/webhooks', { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setWebhooks(data.map(normalizeWebhook));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLoadError('Failed to load webhooks. Please refresh and try again.');
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const addWebhook = useCallback(async (url: string): Promise<boolean> => {
    const validationError = getWebhookUrlError(url);
    if (validationError) {
      setError(validationError);
      return false;
    }
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          events: DEFAULT_WEBHOOK_EVENTS,
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Failed to add webhook';
        throw new Error(message);
      }
      const created = normalizeWebhook(data as RawWebhook);
      setWebhooks((prev) => [created, ...prev]);
      if (typeof data === 'object' && data !== null && 'secret' in data && typeof data.secret === 'string') {
        setCreatedSecret(data.secret);
      } else {
        setCreatedSecret(null);
      }
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add webhook');
      return false;
    } finally {
      setAdding(false);
    }
  }, []);

  const deleteWebhook = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;
    let snapshot: Webhook[] = [];
    setWebhooks((prev) => {
      snapshot = prev;
      return prev.filter((w) => w.id !== id);
    });
    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete webhook');
    } catch (err: unknown) {
      setWebhooks(snapshot);
      setError(err instanceof Error ? err.message : 'Failed to delete webhook');
    }
  }, []);

  const clearSecret = useCallback(() => setCreatedSecret(null), []);

  return { webhooks, loading, loadError, adding, error, createdSecret, clearSecret, addWebhook, deleteWebhook };
}
