import { API_PREFIX, safeReturnTo } from '@influency/shared';

export const TELEGRAM_START = `/${API_PREFIX}/auth/telegram/start`;

function withReturnTo(path: string, returnTo: unknown): string {
  const safe = safeReturnTo(returnTo);
  return safe === '/' ? path : `${path}?returnTo=${encodeURIComponent(safe)}`;
}

/** `/login`, carrying the page to return to after login (for "Masuk" buttons on creator/post pages). */
export function loginHref(returnTo: string): string {
  return withReturnTo('/login', returnTo);
}

/** API start URL for the Telegram button; the API re-checks `returnTo` (authoritative). */
export function telegramStartHref(returnTo: unknown): string {
  return withReturnTo(TELEGRAM_START, returnTo);
}
