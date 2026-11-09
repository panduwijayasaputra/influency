'use client';

import { useSyncExternalStore } from 'react';

/** "Baru dilihat" in Jelajahi → Cari (US-066): stored on this device only, never sent to the server. */
export const RECENT_CREATORS_KEY = 'influency:recent-creators';
export const RECENT_CREATORS_MAX = 20;

export type RecentCreator = { slug: string; displayName: string; avatarUrl: string | null };

const isRecentCreator = (v: unknown): v is RecentCreator => {
  const c = v as Partial<RecentCreator> | null;
  return (
    typeof c?.slug === 'string' &&
    typeof c.displayName === 'string' &&
    (c.avatarUrl === null || typeof c.avatarUrl === 'string')
  );
};

const EMPTY: RecentCreator[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; list: RecentCreator[] } = { raw: null, list: EMPTY };

function readRaw(): string | null {
  try {
    return localStorage.getItem(RECENT_CREATORS_KEY);
  } catch {
    return null;
  }
}

/** Parsed list, cached by the raw string so useSyncExternalStore gets a stable reference. */
function read(): RecentCreator[] {
  const raw = readRaw();
  if (raw === cache.raw) return cache.list;
  let list = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed) && parsed.every(isRecentCreator)) list = parsed;
  } catch {
    // corrupt JSON → empty
  }
  cache = { raw, list };
  return list;
}

function write(list: RecentCreator[]): void {
  try {
    localStorage.setItem(RECENT_CREATORS_KEY, JSON.stringify(list));
  } catch {
    // storage blocked or full: the list just isn't remembered
  }
  listeners.forEach((l) => l());
}

/** Moves the creator to the front (de-duplicated by slug), keeping at most RECENT_CREATORS_MAX. */
export function addRecentCreator(creator: RecentCreator): void {
  const { slug, displayName, avatarUrl } = creator;
  write(
    [{ slug, displayName, avatarUrl }, ...read().filter((c) => c.slug !== slug)].slice(
      0,
      RECENT_CREATORS_MAX,
    ),
  );
}

export function removeRecentCreator(slug: string): void {
  write(read().filter((c) => c.slug !== slug));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Other tabs.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** Newest first; empty during SSR and when storage is unavailable. */
export function useRecentCreators(): RecentCreator[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
