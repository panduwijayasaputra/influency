/** Max length of a stored return path; longer values fall back to `/`. */
export const RETURN_TO_MAX_LENGTH = 512;

const BASE = 'http://x.invalid';
// Printable ASCII only: browsers treat `\` as `/` and strip tab/newline (could become `//host`),
// and non-ASCII is invalid in a Location header. Real paths arrive percent-encoded anyway.
const UNSAFE_CHARS = /[^\x21-\x7E]|\\/;
// Login and raw API paths would loop or land on JSON.
const BLOCKED_SEGMENTS = ['/login', '/api'];

/**
 * Same-origin relative path or `/`. Used by the API (authoritative) and the web app.
 * Never returns an absolute or protocol-relative URL (no open redirect).
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > RETURN_TO_MAX_LENGTH) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || UNSAFE_CHARS.test(value)) return '/';
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return '/';
  }
  if (url.origin !== BASE) return '/';
  const blocked = BLOCKED_SEGMENTS.some(
    (s) => url.pathname === s || url.pathname.startsWith(`${s}/`),
  );
  return blocked ? '/' : value;
}
