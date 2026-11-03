import { cookies } from 'next/headers';
import {
  API_PREFIX,
  type CreatorApplicationResponse,
  creatorApplicationResponseSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { API_ORIGIN } from './origin';

/** Server only. The logged-in user's creator application, or null (none, or logged out). */
export async function getMyCreatorApplication(): Promise<CreatorApplicationResponse | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const res = await fetch(`${API_ORIGIN}/${API_PREFIX}/creators/me/application`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` }, // forward only the session cookie
    cache: 'no-store',
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /creators/me/application failed: ${res.status}`);
  const body = (await res.json()) as { application: unknown };
  return creatorApplicationResponseSchema.nullable().parse(body.application);
}
