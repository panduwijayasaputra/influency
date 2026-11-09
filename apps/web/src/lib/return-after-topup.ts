import { safeReturnTo } from '@influency/shared';

const KEY = 'topup-return-to';

/**
 * Midtrans drops our query string on the way back, so the page the user came from ("Isi Koin" in a purchase sheet)
 * is kept in sessionStorage while they pay. Storage can be blocked: every access is guarded.
 */
export function rememberReturnTo(search: string): void {
  try {
    const path = safeReturnTo(new URLSearchParams(search).get('returnTo'));
    if (path !== '/') sessionStorage.setItem(KEY, path);
  } catch {
    // storage unavailable: the status page just offers Dompet
  }
}

/** The remembered same-origin path, or null. */
export function recallReturnTo(): string | null {
  try {
    const path = safeReturnTo(sessionStorage.getItem(KEY));
    return path === '/' ? null : path;
  } catch {
    return null;
  }
}
