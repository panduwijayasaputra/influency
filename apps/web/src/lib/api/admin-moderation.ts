import { cookies } from 'next/headers';
import {
  API_PREFIX,
  type ModerationQueueItem,
  moderationQueueSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { API_ORIGIN } from './origin';

/** Server only. Posts with open reports for the moderation queue (API enforces AdminGuard). */
export async function getModerationQueue(): Promise<ModerationQueueItem[]> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await fetch(`${API_ORIGIN}/${API_PREFIX}/admin/moderation`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}, // forward only the session cookie
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GET /admin/moderation failed: ${res.status}`);
  return moderationQueueSchema.parse(await res.json()).items;
}
