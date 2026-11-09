import { API_PREFIX, SESSION_COOKIE, unreadCountSchema } from '@influency/shared';
import { cookies } from 'next/headers';
import { API_ORIGIN } from './origin';

/** Server only. My unread notification count for the Beranda bell (cookie forwarded); 0 on any failure so Home still renders. */
export async function getUnreadCount(): Promise<number> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return 0;
    const res = await fetch(`${API_ORIGIN}/${API_PREFIX}/me/notifications/unread-count`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return 0;
    const parsed = unreadCountSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.count : 0;
  } catch {
    return 0;
  }
}
