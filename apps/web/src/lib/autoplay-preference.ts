'use client';

import { useSyncExternalStore } from 'react';

/** "Putar video otomatis" in Pengaturan (US-068): a per-device choice, default on. */
export const AUTOPLAY_KEY = 'influency:autoplay';

const listeners = new Set<() => void>();

/** False only when this device saved 'off'; storage errors count as on. */
export function readAutoplayEnabled(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAutoplayEnabled(on: boolean): void {
  try {
    localStorage.setItem(AUTOPLAY_KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the choice lasts for this page only
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** Current preference; true during SSR. */
export function useAutoplayEnabled(): boolean {
  return useSyncExternalStore(subscribe, readAutoplayEnabled, () => true);
}
