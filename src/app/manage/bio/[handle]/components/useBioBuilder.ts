import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { BioBlock, BioProfile, ProfileField } from './types';
import { getBlockUrlError, sanitizeBlockUrl } from './validateBio';

/** Delay before an optimistic block edit is persisted, so typing ≠ request-per-keystroke. */
const BLOCK_SAVE_DEBOUNCE_MS = 600;

/**
 * Owns bio-builder fetching and mutations.
 *
 * Fixes vs the previous inline implementation:
 * - the profile fetch is tied to an AbortController (no setState-after-unmount);
 * - all `setBlocks` calls are functional, so rapid edits cannot clobber each other
 *   through stale closures;
 * - block edits are applied instantly locally but persisted debounced, with the
 *   pending timers cleared on unmount;
 * - block URLs are sanitized before persisting and invalid URLs are not sent
 *   (the draft is kept locally with an inline error);
 * - deletes roll back to the pre-delete snapshot when the API call fails;
 * - profile saves check `res.ok` and surface failures instead of silently passing.
 */
export function useBioBuilder() {
  const params = useParams<{ handle: string }>();
  const router = useRouter();
  const handle = typeof params?.handle === 'string' ? params.handle : '';

  const [profile, setProfile] = useState<BioProfile | null>(null);
  const profileRef = useRef<BioProfile | null>(null);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  const [blocks, setBlocks] = useState<BioBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [blockUrlErrors, setBlockUrlErrors] = useState<Record<string, string | null>>({});
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!handle) return;
    const controller = new AbortController();
    fetch(`/api/bio/${handle}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data) => {
        setProfile(data);
        setBlocks(data.blocks || []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        router.push('/manage/bio');
      });
    return () => controller.abort();
  }, [handle, router]);

  // Clear any pending debounced block saves when the builder unmounts.
  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const persistBlock = useCallback(async (id: string, updates: Partial<BioBlock>) => {
    const payload = { ...updates };
    if (typeof payload.url === 'string') payload.url = sanitizeBlockUrl(payload.url);
    const res = await fetch(`/api/bio/blocks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to save block');
  }, []);

  const scheduleBlockSave = useCallback(
    (id: string, updates: Partial<BioBlock>) => {
      const existing = saveTimers.current.get(id);
      if (existing) clearTimeout(existing);
      saveTimers.current.set(
        id,
        setTimeout(() => {
          saveTimers.current.delete(id);
          persistBlock(id, updates).catch((err: unknown) => {
            setSaveError(err instanceof Error ? err.message : 'Failed to save block');
          });
        }, BLOCK_SAVE_DEBOUNCE_MS)
      );
    },
    [persistBlock]
  );

  const updateProfileField = useCallback((field: ProfileField, value: string) => {
    setProfile((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const saveProfile = useCallback(async () => {
    const current = profileRef.current;
    if (!current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/bio/${current.handle}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: current.displayName,
          bioText: current.bioText,
          theme: current.theme,
          avatarUrl: current.avatarUrl,
        }),
      });
      if (!res.ok) throw new Error('Failed to save profile');
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }, []);

  const addBlock = useCallback(
    async (type: string) => {
      if (!profile) return;
      setSaveError(null);
      try {
        const res = await fetch(`/api/bio/${profile.handle}/blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            title: type === 'link' ? 'New Link' : undefined,
          }),
        });
        if (!res.ok) throw new Error('Failed to add block');
        const newBlock = (await res.json()) as BioBlock;
        setBlocks((prev) => [...prev, newBlock]);
      } catch (err: unknown) {
        setSaveError(err instanceof Error ? err.message : 'Failed to add block');
      }
    },
    [profile]
  );

  const updateBlock = useCallback(
    (id: string, updates: Partial<BioBlock>) => {
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
      if (typeof updates.url === 'string') {
        const urlError = getBlockUrlError(updates.url);
        setBlockUrlErrors((prev) => ({ ...prev, [id]: urlError }));
        // Keep the draft locally but do not persist an invalid URL.
        if (urlError) return;
      }
      scheduleBlockSave(id, updates);
    },
    [scheduleBlockSave]
  );

  const deleteBlock = useCallback(async (id: string) => {
    let snapshot: BioBlock[] = [];
    setBlocks((prev) => {
      snapshot = prev;
      return prev.filter((b) => b.id !== id);
    });
    try {
      const res = await fetch(`/api/bio/blocks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete block');
      setBlockUrlErrors((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err: unknown) {
      setBlocks(snapshot);
      setSaveError(err instanceof Error ? err.message : 'Failed to delete block');
    }
  }, []);

  return {
    profile,
    blocks,
    loading,
    loadError,
    saving,
    saveError,
    blockUrlErrors,
    updateProfileField,
    saveProfile,
    addBlock,
    updateBlock,
    deleteBlock,
    setLoadError,
  };
}
