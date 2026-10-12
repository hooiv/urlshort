import { useCallback, useEffect, useState } from 'react';
import type { Webhook, WebhookLinkFilter, WebhookLinkScope } from './types';
import { DEFAULT_WEBHOOK_EVENTS, getWebhookUrlError } from './validateWebhook';
import { describeTestResult } from './slackSettings';

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
  linkScope?: string;
  tags?: string[];
  shortCodes?: string[];
  folderIds?: string[];
  folderIdFilter?: string[];
  workspaceId?: string | null;
  workspaceName?: string | null;
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
    linkScope: raw.linkScope === 'tags' || raw.linkScope === 'links' || raw.linkScope === 'folders' ? (raw.linkScope as WebhookLinkScope) : 'all',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    shortCodes: Array.isArray(raw.shortCodes) ? raw.shortCodes : [],
    folderIds: Array.isArray(raw.folderIds) ? raw.folderIds : Array.isArray(raw.folderIdFilter) ? raw.folderIdFilter : [],
    workspaceId: raw.workspaceId ?? null,
    workspaceName: raw.workspaceName ?? null,
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

  const addWebhook = useCallback(async (url: string, filter: WebhookLinkFilter): Promise<boolean> => {
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
          linkScope: filter.linkScope,
          ...(filter.linkScope === 'tags' ? { tags: filter.tags } : {}),
          ...(filter.linkScope === 'links' ? { shortCodes: filter.shortCodes } : {}),
          ...(filter.linkScope === 'folders' ? { folderIds: filter.folderIds } : {}),
          ...(filter.linkScope === 'folders' ? { folderIds: filter.folderIds } : {}),
          ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {}),
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

  const deleteWebhook = useCallback(async (id: string, skipConfirm = false) => {
    if (!skipConfirm && !confirm('Are you sure you want to delete this webhook?')) return;
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

  const connectSlack = useCallback(async (url: string, events: string[]): Promise<boolean> => {
    setError(null);
    const res = await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, events }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : 'Failed to connect Slack');
      return false;
    }
    setWebhooks((prev) => [normalizeWebhook(data as RawWebhook), ...prev]);
    return true;
  }, []);

  const updateWebhook = useCallback(async (id: string, patch: { events?: string[]; isActive?: boolean }): Promise<boolean> => {
    const res = await fetch(`/api/webhooks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data: unknown = await res.json().catch(() => null);
      setError(typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : 'Update failed');
      return false;
    }
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
    return true;
  }, []);

  const testWebhook = useCallback(async (id: string): Promise<string> => {
    try {
      const res = await fetch(`/api/webhooks/${id}/test`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; statusCode?: number | null; responseSnippet?: string | null; error?: string };
      if (!res.ok) return data.error ?? 'Test failed';
      return describeTestResult(data);
    } catch {
      return 'Test failed: network error';
    }
  }, []);

  const clearSecret = useCallback(() => setCreatedSecret(null), []);

  return { webhooks, loading, loadError, adding, error, createdSecret, clearSecret, addWebhook, deleteWebhook, connectSlack, updateWebhook, testWebhook };
}
