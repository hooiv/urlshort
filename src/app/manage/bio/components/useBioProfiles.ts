import { useCallback, useEffect, useState } from 'react';
import type { BioProfileSummary } from './types';

/**
 * Fetches the profile list and owns profile-creation state.
 *
 * Fixes vs the previous inline implementation: the list fetch is tied to an
 * AbortController (no setState-after-unmount), list-fetch failures are
 * surfaced instead of rendering an eternal skeleton, and prepends use a
 * functional update so concurrent creates cannot drop each other.
 */
export function useBioProfiles() {
  const [profiles, setProfiles] = useState<BioProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/bio', { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProfiles(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLoadError('Failed to load bio pages. Please refresh and try again.');
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const createProfile = useCallback(async (handle: string): Promise<boolean> => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/bio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const message =
          typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Failed to create profile';
        throw new Error(message);
      }
      const created = (await res.json()) as BioProfileSummary;
      setProfiles((prev) => [created, ...prev]);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create profile');
      return false;
    } finally {
      setCreating(false);
    }
  }, []);

  return { profiles, loading, loadError, creating, error, createProfile };
}
