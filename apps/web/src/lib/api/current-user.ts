import { cookies } from 'next/headers';
import { cache } from 'react';
import { API_PREFIX, type MeResponse, meResponseSchema, SESSION_COOKIE } from '@influency/shared';
import { API_ORIGIN } from './origin';

/** Server only. The logged-in user from GET /auth/me, or null when logged out. Deduped per request. */
export const getCurrentUser = cache(async (): Promise<MeResponse | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const res = await fetch(`${API_ORIGIN}/${API_PREFIX}/auth/me`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` }, // forward only the session cookie
    cache: 'no-store',
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /auth/me failed: ${res.status}`);
  return meResponseSchema.parse(await res.json());
});
