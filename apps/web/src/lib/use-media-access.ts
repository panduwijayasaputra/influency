'use client';

import { useEffect, useState } from 'react';
import { API_PREFIX, type MediaAccessResponse, mediaAccessResponseSchema } from '@influency/shared';

/** Fetch fresh URLs this long before the current ones expire. */
const REFRESH_LEAD_MS = 60_000;

export type MediaState =
  | { kind: 'idle' | 'loading' }
  | { kind: 'ready'; access: MediaAccessResponse }
  | { kind: 'locked' | 'missing' | 'failed' };

async function fetchAccess(postId: string): Promise<MediaState> {
  try {
    const res = await fetch(`/${API_PREFIX}/posts/${postId}/media-access`, { cache: 'no-store' });
    if (res.status === 403) return { kind: 'locked' };
    if (res.status === 404) return { kind: 'missing' };
    const parsed = mediaAccessResponseSchema.safeParse(res.ok ? await res.json() : null);
    return parsed.success ? { kind: 'ready', access: parsed.data } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}

/**
 * Viewable media of a post from GET /posts/:id/media-access (server-side access check), in the browser only, so URLs
 * never end up in SSR HTML; refreshed before they expire. Nothing is fetched while `enabled` is false.
 */
export function useMediaAccess(postId: string, enabled = true) {
  const [state, setState] = useState<MediaState>({ kind: enabled ? 'loading' : 'idle' });
  // Bumped to fetch again (retry, refresh before expiry).
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void fetchAccess(postId).then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, [postId, enabled, version]);

  const expiresAt = state.kind === 'ready' ? state.access.expiresAt : null;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(
      () => setVersion((v) => v + 1),
      Math.max(0, Date.parse(expiresAt) - Date.now() - REFRESH_LEAD_MS),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);

  const shown: MediaState = enabled && state.kind === 'idle' ? { kind: 'loading' } : state;
  return { state: shown, retry: () => setVersion((v) => v + 1) };
}
