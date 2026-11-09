import {
  API_PREFIX,
  type NotificationsPage,
  notificationsPageSchema,
  unreadCountSchema,
} from '@influency/shared';

/** One page of my notifications, newest first. `cursor` is opaque (null = first page). */
export async function fetchNotificationsPage(cursor: string | null): Promise<NotificationsPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await fetch(`/${API_PREFIX}/me/notifications${query}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`GET /me/notifications failed: ${res.status}`);
  return notificationsPageSchema.parse(await res.json());
}

/** My unread count (bell dot). */
export async function fetchUnreadCount(): Promise<number> {
  const res = await fetch(`/${API_PREFIX}/me/notifications/unread-count`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`GET /me/notifications/unread-count failed: ${res.status}`);
  return unreadCountSchema.parse(await res.json()).count;
}

/** Marks my notifications up to and including `upToId` as read. */
export async function markNotificationsRead(upToId: string): Promise<void> {
  const res = await fetch(`/${API_PREFIX}/me/notifications/read`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ upToId }),
  });
  if (!res.ok) throw new Error(`POST /me/notifications/read failed: ${res.status}`);
}
