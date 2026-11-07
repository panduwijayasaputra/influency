import { API_PREFIX, type FollowState, followStateSchema, SESSION_COOKIE } from '@influency/shared';
import { cookies } from 'next/headers';
import { API_ORIGIN } from './origin';

/** Server only. Follow state for the viewer (cookie forwarded), uncached; null on any failure so the page still renders. */
export async function getFollowState(slug: string): Promise<FollowState | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const res = await fetch(`${API_ORIGIN}/${API_PREFIX}/creators/${slug}/follow`, {
      headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const parsed = followStateSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
