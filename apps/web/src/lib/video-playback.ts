import { useSyncExternalStore } from 'react';

/** Share of a video that must be on screen before it autoplays. Example value: spec §6.3 doesn't lock the threshold. */
export const AUTOPLAY_VISIBLE_RATIO = 0.6;

// The one video allowed to play (US-009): claiming pauses every other one.
let active: string | null = null;
const listeners = new Set<() => void>();

function set(next: string | null) {
  if (active === next) return;
  active = next;
  for (const listener of listeners) listener();
}

export const claimPlayback = (id: string) => set(id);
/** Gives up the claim only if `id` still holds it. */
export const releasePlayback = (id: string) => {
  if (active === id) set(null);
};
/** Pauses whatever plays, e.g. when a sheet or the viewer opens. */
export const pauseAllVideos = () => set(null);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function usePlaybackActive(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => active === id,
    () => false,
  );
}

/** Reduced motion or data saving: show a play button instead of autoplaying. Call in the browser only. */
export function prefersTapToPlay(): boolean {
  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return reducedMotion || connection?.saveData === true;
}
