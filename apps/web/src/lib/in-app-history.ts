// Whether the user has navigated inside the app in this tab session; feeds PageHeader's back button.
// shortcut: one-way "has navigated" flag, so back can leave the site after returning to the landing page; track history depth if users hit it.
let navigated = false;
const listeners = new Set<() => void>();

export function markInAppNavigation(): void {
  if (navigated) return;
  navigated = true;
  listeners.forEach((listener) => listener());
}

export function subscribeInAppHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasInAppHistory(): boolean {
  return navigated;
}

/** Test-only. */
export function resetInAppHistory(): void {
  navigated = false;
}
