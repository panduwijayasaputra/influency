import { cookies } from 'next/headers';
import {
  API_PREFIX,
  type CreatorProfileResponse,
  creatorProfileResponseSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { API_ORIGIN } from './origin';

/** Server only. The logged-in approved creator's own profile, or null (logged out / not approved). */
export async function getMyCreatorProfile(): Promise<CreatorProfileResponse | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const res = await fetch(`${API_ORIGIN}/${API_PREFIX}/creators/me`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` }, // forward only the session cookie
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`GET /creators/me failed: ${res.status}`);
  return creatorProfileResponseSchema.parse(await res.json());
}
